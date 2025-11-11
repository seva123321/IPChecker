-- 1. Расширение для триграмм (поиск по подстроке)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Основная таблица хостов
CREATE TABLE IF NOT EXISTS hosts (
    id SERIAL PRIMARY KEY,
    ip INET NOT NULL UNIQUE,
    reachable BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для поиска по частичному IP (например: '192.168.%')
CREATE INDEX IF NOT EXISTS idx_hosts_ip_text ON hosts ((ip::TEXT) text_pattern_ops);

-- Индекс для сортировки и фильтрации по времени
CREATE INDEX IF NOT EXISTS idx_hosts_updated_at ON hosts (updated_at);

-- 3. Таблица известных портов
CREATE TABLE IF NOT EXISTS well_known_ports (
    port INT PRIMARY KEY,
    name TEXT NOT NULL
);

-- Заполняем базовыми значениями
INSERT INTO well_known_ports (port, name) VALUES
  (21, 'ftp'), (22, 'ssh'), (23, 'telnet'), (25, 'smtp'), (53, 'dns'),
  (80, 'http'), (110, 'pop3'), (135, 'msrpc'), (139, 'netbios-ssn'),
  (143, 'imap'), (443, 'https'), (445, 'microsoft-ds'), (993, 'imaps'),
  (995, 'pop3s'), (1723, 'pptp'), (3306, 'mysql'), (3389, 'rdp'),
  (5900, 'vnc'), (8080, 'http-alt')
ON CONFLICT (port) DO NOTHING;

-- Безопасное создание ENUM-типа
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'port_type') THEN
    CREATE TYPE port_type AS ENUM ('open', 'filtered');
  END IF;
END$$;

-- Таблица портов
CREATE TABLE IF NOT EXISTS ports (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    type port_type NOT NULL,
    UNIQUE (host_id, port, type)
);

-- Индекс для быстрого поиска по порту и типу
CREATE INDEX IF NOT EXISTS idx_ports_host_id ON ports (host_id);
CREATE INDEX IF NOT EXISTS idx_ports_port_type ON ports (port, type);

-- 5. WHOIS-ключи
CREATE TABLE IF NOT EXISTS whois_keys (
    id SERIAL PRIMARY KEY,
    key_name TEXT NOT NULL UNIQUE
);

-- Индекс для поиска по частичному ключу (например: '%org%')
CREATE INDEX IF NOT EXISTS idx_whois_keys_name_trgm ON whois_keys USING GIN (key_name gin_trgm_ops);

-- 6. WHOIS-данные
CREATE TABLE IF NOT EXISTS whois (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL REFERENCES whois_keys(id) ON DELETE CASCADE,
    value TEXT,
    UNIQUE (host_id, key_id)
);

-- Индекс для поиска по частичному значению (например: '%Google%')
CREATE INDEX IF NOT EXISTS idx_whois_value_trgm ON whois USING GIN (value gin_trgm_ops);


-- Вставляем только важные поля для определения принадлежности, контактов и локации
INSERT INTO public.whois_keys (key_name) VALUES
-- Организация
('org'),
('org-name'),
('organization'),
('OrgName'),
('descr'),
('netname'),
('NetName'),
('OrgId'),
('OrgTechName'),
('OrgAbuseName'),

-- Страна
('country'),
('Country'),

-- Географическое местоположение
('city'),
('StateProv'),
('PostalCode'),
('address'),
('geoloc'),
('remarks'),

-- Контактная информация
('phone'),
('e-mail'),
('abuse-mailbox'),
('OrgTechEmail'),
('OrgAbuseEmail'),

-- Диапазон IP и регистрация
('inetnum'),
('NetRange'),
('NetHandle'),
('RegDate'),
('Updated');

CREATE OR REPLACE FUNCTION upsert_host_with_data(
    p_ip TEXT,
    p_reachable BOOLEAN,
    p_open_ports INT[],
    p_filtered_ports INT[],
    p_whois_data JSONB
)
RETURNS VOID AS $$
DECLARE
    v_host_id INT;
BEGIN
    -- Вставка или обновление хоста
    INSERT INTO hosts (ip, reachable)
    VALUES (p_ip::INET, p_reachable)
    ON CONFLICT (ip) DO UPDATE
        SET reachable = EXCLUDED.reachable,
            updated_at = NOW()
    RETURNING id INTO v_host_id;

    -- Удаление старых портов и WHOIS
    DELETE FROM ports WHERE host_id = v_host_id;
    DELETE FROM whois WHERE host_id = v_host_id;

    -- Вставка новых открытых портов
    INSERT INTO ports (host_id, port, type)
    SELECT v_host_id, unnest(p_open_ports), 'open'
    ON CONFLICT DO NOTHING;

    -- Вставка новых фильтрованных портов
    INSERT INTO ports (host_id, port, type)
    SELECT v_host_id, unnest(p_filtered_ports), 'filtered'
    ON CONFLICT DO NOTHING;

    -- Вставка WHOIS-данных
    IF p_whois_data IS NOT NULL AND p_whois_data != '{}'::JSONB THEN
        INSERT INTO whois_keys (key_name)
        SELECT key
        FROM jsonb_each_text(p_whois_data)
        ON CONFLICT (key_name) DO NOTHING;

        INSERT INTO whois (host_id, key_id, value)
        SELECT
            v_host_id,
            k.id,
            p_whois_data->>w.key
        FROM jsonb_each_text(p_whois_data) AS w(key, value)
        JOIN whois_keys k ON k.key_name = w.key;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- SELECT h.ip, k.key_name, w.value
-- FROM hosts h
-- JOIN whois w ON h.id = w.host_id
-- JOIN whois_keys k ON w.key_id = k.id
-- WHERE w.value ILIKE '%Google%';

-- SELECT upsert_host_with_data(
--   '142.250.191.106',
--   true,
--   ARRAY[80, 443],
--   ARRAY[22, 23, 25, 53],
--   '{"netname": "GOOGLE", "country": "US", "org": "Google LLC"}'::JSONB
-- );

-- SELECT upsert_host_with_data(
--   '142.250.191.106', -- тот же IP → полная замена данных
--   true,
--   ARRAY[80, 443, 8080],
--   ARRAY[22, 25],
--   '{"netname": "GOOGLE-CLOUD", "org": "Google Cloud"}'::JSONB
-- );

-- SELECT upsert_host_with_data(
--   '1.1.1.1',
--   true,
--   ARRAY[53, 80, 443],
--   ARRAY[22, 23],
--   NULL
-- );

