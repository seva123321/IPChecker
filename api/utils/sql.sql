-- 1. Расширение для триграмм (поиск по подстроке)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Основная таблица хостов
CREATE TABLE IF NOT EXISTS hosts (
    id SERIAL PRIMARY KEY,
    ip INET NOT NULL UNIQUE,
    reachable BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    priority_id INTEGER REFERENCES host_priorities(id),
    grouping_id INTEGER REFERENCES host_groupings(id)
);

-- Индекс для поиска по частичному IP (например: '192.168.%')
CREATE INDEX IF NOT EXISTS idx_hosts_ip_text ON hosts ((ip::TEXT) text_pattern_ops);

-- Индекс для сортировки и фильтрации по времени
CREATE INDEX IF NOT EXISTS idx_hosts_updated_at ON hosts (updated_at);

-- Индекс для поиска по приоритету
CREATE INDEX IF NOT EXISTS idx_hosts_priority_id ON hosts (priority_id);

-- Индекс для поиска по группировке
CREATE INDEX IF NOT EXISTS idx_hosts_grouping_id ON hosts (grouping_id);

-- 3. Таблица приоритетов хостов
CREATE TABLE IF NOT EXISTS host_priorities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE -- Обычный, Интересный, Важный
);

-- Вставляем значения по умолчанию
INSERT INTO host_priorities (name) VALUES
  ('Обычный'),
  ('Интересный'),
  ('Важный')
ON CONFLICT (name) DO NOTHING;

-- 4. Таблица комментариев к приоритетам
CREATE TABLE IF NOT EXISTS priority_comments (
    id SERIAL PRIMARY KEY,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    priority_id INTEGER NOT NULL REFERENCES host_priorities(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(host_id, priority_id)
);

-- Индекс для поиска по хосту и приоритету
CREATE INDEX IF NOT EXISTS idx_priority_comments_host_priority ON priority_comments (host_id, priority_id);

-- 5. Таблица группировки
CREATE TABLE IF NOT EXISTS host_groupings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE -- МИД, Гражданская промышленность, Военная промышленность, Новостные организации
);

-- Вставляем значения по умолчанию
INSERT INTO host_groupings (name) VALUES
  ('МИД'),
  ('Гражданская промышленность'),
  ('Военная промышленность'),
  ('Новостные организации'),
  ('Финансовый сектор'),
  ('Телекоммуникации'),
  ('Государственные учреждения'),
  ('Образовательные организации'),
  ('Здравоохранение'),
  ('Энергетика'),
  ('Транспорт и логистика'),
  ('IT-инфраструктура и облака'),
  ('Критическая информационная инфраструктура (КИИ)'),
  ('Социальные сети и мессенджеры'),
  ('Хостинг-провайдеры и дата-центры')
ON CONFLICT (name) DO NOTHING;

-- 6. Таблица известных портов
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