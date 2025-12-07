-- 1. Таблица стран
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- Индекс для поиска по названию страны
CREATE INDEX IF NOT EXISTS idx_countries_name ON countries (name);

-- 2. Таблица источников файлов
CREATE TABLE IF NOT EXISTS file_sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    encoding VARCHAR(50) DEFAULT 'UTF-8',
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для поиска по названию файла
CREATE INDEX IF NOT EXISTS idx_file_sources_name ON file_sources (name);

-- 3. Добавляем новые колонки в таблицу hosts
ALTER TABLE hosts 
ADD COLUMN IF NOT EXISTS country_id INTEGER REFERENCES countries(id),
ADD COLUMN IF NOT EXISTS file_source_id INTEGER REFERENCES file_sources(id);

-- Индексы для новых связей
CREATE INDEX IF NOT EXISTS idx_hosts_country_id ON hosts (country_id);
CREATE INDEX IF NOT EXISTS idx_hosts_file_source_id ON hosts (file_source_id);

-- 4. Функция для автоматического определения страны из WHOIS данных
CREATE OR REPLACE FUNCTION update_host_country_from_whois()
RETURNS TRIGGER AS $$
BEGIN
    -- Ищем страну в WHOIS данных
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Обновляем country_id на основе WHOIS данных
        UPDATE hosts 
        SET country_id = (
            SELECT c.id 
            FROM countries c 
            WHERE c.name = (
                SELECT w.value 
                FROM whois w 
                JOIN whois_keys wk ON w.key_id = wk.id 
                WHERE w.host_id = NEW.id 
                AND wk.key_name IN ('country', 'Country')
                LIMIT 1
            )
        )
        WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления страны при изменении WHOIS данных
DROP TRIGGER IF EXISTS trigger_update_country_from_whois ON whois;
CREATE TRIGGER trigger_update_country_from_whois
    AFTER INSERT OR UPDATE ON whois
    FOR EACH ROW
    EXECUTE FUNCTION update_host_country_from_whois();

-- 5. Функция для вставки или получения страны
CREATE OR REPLACE FUNCTION get_or_create_country(country_name TEXT)
RETURNS INTEGER AS $$
DECLARE
    country_id INTEGER;
BEGIN
    -- Пытаемся найти существующую страну
    SELECT id INTO country_id 
    FROM countries 
    WHERE name = country_name;
    
    -- Если не найдено, создаем новую
    IF country_id IS NULL THEN
        INSERT INTO countries (name) 
        VALUES (country_name)
        RETURNING id INTO country_id;
    END IF;
    
    RETURN country_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Обновленная функция для вставки хоста с данными
CREATE OR REPLACE FUNCTION upsert_host_with_data(
    p_ip TEXT,
    p_reachable BOOLEAN,
    p_open_ports INT[],
    p_filtered_ports INT[],
    p_whois_data JSONB,
    p_file_source_name TEXT DEFAULT NULL,
    p_file_encoding TEXT DEFAULT 'UTF-8'
)
RETURNS VOID AS $$
DECLARE
    v_host_id INT;
    v_country_id INT;
    v_file_source_id INT;
    v_country_name TEXT;
BEGIN
    -- Вставка или получение источника файла
    IF p_file_source_name IS NOT NULL THEN
        INSERT INTO file_sources (name, encoding)
        VALUES (p_file_source_name, p_file_encoding)
        ON CONFLICT (name) DO UPDATE
        SET uploaded_at = NOW()
        RETURNING id INTO v_file_source_id;
    END IF;

    -- Вставка или обновление хоста
    INSERT INTO hosts (ip, reachable, file_source_id)
    VALUES (p_ip::INET, p_reachable, v_file_source_id)
    ON CONFLICT (ip) DO UPDATE
        SET reachable = EXCLUDED.reachable,
            updated_at = NOW(),
            file_source_id = COALESCE(EXCLUDED.file_source_id, hosts.file_source_id)
    RETURNING id INTO v_host_id;

    -- Определяем страну из WHOIS данных
    v_country_name := COALESCE(
        p_whois_data->>'country',
        p_whois_data->>'Country'
    );
    
    IF v_country_name IS NOT NULL THEN
        v_country_id := get_or_create_country(v_country_name);
        
        -- Обновляем страну хоста
        UPDATE hosts 
        SET country_id = v_country_id 
        WHERE id = v_host_id;
    END IF;

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


-- -- 1. Таблица стран
-- CREATE TABLE IF NOT EXISTS countries (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(100) NOT NULL UNIQUE COLLATE "ru_RU.UTF-8"
-- );

-- -- Индекс для поиска по названию страны
-- CREATE INDEX IF NOT EXISTS idx_countries_name ON countries (name);

-- -- 2. Таблица источников файлов
-- CREATE TABLE IF NOT EXISTS file_sources (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) NOT NULL COLLATE "ru_RU.UTF-8",
--     encoding VARCHAR(50) DEFAULT 'UTF-8',
--     uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- -- Индекс для поиска по названию файла
-- CREATE INDEX IF NOT EXISTS idx_file_sources_name ON file_sources (name);

-- -- 3. Добавляем новые колонки в таблицу hosts
-- ALTER TABLE hosts 
-- ADD COLUMN IF NOT EXISTS country_id INTEGER REFERENCES countries(id),
-- ADD COLUMN IF NOT EXISTS file_source_id INTEGER REFERENCES file_sources(id);

-- -- Индексы для новых связей
-- CREATE INDEX IF NOT EXISTS idx_hosts_country_id ON hosts (country_id);
-- CREATE INDEX IF NOT EXISTS idx_hosts_file_source_id ON hosts (file_source_id);

-- -- 4. Функция для автоматического определения страны из WHOIS данных
-- CREATE OR REPLACE FUNCTION update_host_country_from_whois()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     -- Ищем страну в WHOIS данных
--     IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
--         -- Обновляем country_id на основе WHOIS данных
--         UPDATE hosts 
--         SET country_id = (
--             SELECT c.id 
--             FROM countries c 
--             WHERE c.name = (
--                 SELECT w.value 
--                 FROM whois w 
--                 JOIN whois_keys wk ON w.key_id = wk.id 
--                 WHERE w.host_id = NEW.id 
--                 AND wk.key_name IN ('country', 'Country')
--                 LIMIT 1
--             )
--         )
--         WHERE id = NEW.id;
--     END IF;
    
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- -- Триггер для автоматического обновления страны при изменении WHOIS данных
-- DROP TRIGGER IF EXISTS trigger_update_country_from_whois ON whois;
-- CREATE TRIGGER trigger_update_country_from_whois
--     AFTER INSERT OR UPDATE ON whois
--     FOR EACH ROW
--     EXECUTE FUNCTION update_host_country_from_whois();

-- -- 5. Функция для вставки или получения страны
-- CREATE OR REPLACE FUNCTION get_or_create_country(country_name TEXT)
-- RETURNS INTEGER AS $$
-- DECLARE
--     country_id INTEGER;
-- BEGIN
--     -- Пытаемся найти существующую страну
--     SELECT id INTO country_id 
--     FROM countries 
--     WHERE name = country_name;
    
--     -- Если не найдено, создаем новую
--     IF country_id IS NULL THEN
--         INSERT INTO countries (name) 
--         VALUES (country_name)
--         RETURNING id INTO country_id;
--     END IF;
    
--     RETURN country_id;
-- END;
-- $$ LANGUAGE plpgsql;

-- -- 6. Обновленная функция для вставки хоста с данными
-- CREATE OR REPLACE FUNCTION upsert_host_with_data(
--     p_ip TEXT,
--     p_reachable BOOLEAN,
--     p_open_ports INT[],
--     p_filtered_ports INT[],
--     p_whois_data JSONB,
--     p_file_source_name TEXT DEFAULT NULL,
--     p_file_encoding TEXT DEFAULT 'UTF-8'
-- )
-- RETURNS VOID AS $$
-- DECLARE
--     v_host_id INT;
--     v_country_id INT;
--     v_file_source_id INT;
--     v_country_name TEXT;
-- BEGIN
--     -- Вставка или получение источника файла
--     IF p_file_source_name IS NOT NULL THEN
--         INSERT INTO file_sources (name, encoding)
--         VALUES (p_file_source_name, p_file_encoding)
--         ON CONFLICT (name) DO UPDATE
--         SET uploaded_at = NOW()
--         RETURNING id INTO v_file_source_id;
--     END IF;

--     -- Вставка или обновление хоста
--     INSERT INTO hosts (ip, reachable, file_source_id)
--     VALUES (p_ip::INET, p_reachable, v_file_source_id)
--     ON CONFLICT (ip) DO UPDATE
--         SET reachable = EXCLUDED.reachable,
--             updated_at = NOW(),
--             file_source_id = COALESCE(EXCLUDED.file_source_id, hosts.file_source_id)
--     RETURNING id INTO v_host_id;

--     -- Определяем страну из WHOIS данных
--     v_country_name := COALESCE(
--         p_whois_data->>'country',
--         p_whois_data->>'Country'
--     );
    
--     IF v_country_name IS NOT NULL THEN
--         v_country_id := get_or_create_country(v_country_name);
        
--         -- Обновляем страну хоста
--         UPDATE hosts 
--         SET country_id = v_country_id 
--         WHERE id = v_host_id;
--     END IF;

--     -- Удаление старых портов и WHOIS
--     DELETE FROM ports WHERE host_id = v_host_id;
--     DELETE FROM whois WHERE host_id = v_host_id;

--     -- Вставка новых открытых портов
--     INSERT INTO ports (host_id, port, type)
--     SELECT v_host_id, unnest(p_open_ports), 'open'
--     ON CONFLICT DO NOTHING;

--     -- Вставка новых фильтрованных портов
--     INSERT INTO ports (host_id, port, type)
--     SELECT v_host_id, unnest(p_filtered_ports), 'filtered'
--     ON CONFLICT DO NOTHING;

--     -- Вставка WHOIS-данных
--     IF p_whois_data IS NOT NULL AND p_whois_data != '{}'::JSONB THEN
--         INSERT INTO whois_keys (key_name)
--         SELECT key
--         FROM jsonb_each_text(p_whois_data)
--         ON CONFLICT (key_name) DO NOTHING;

--         INSERT INTO whois (host_id, key_id, value)
--         SELECT
--             v_host_id,
--             k.id,
--             p_whois_data->>w.key
--         FROM jsonb_each_text(p_whois_data) AS w(key, value)
--         JOIN whois_keys k ON k.key_name = w.key;
--     END IF;
-- END;
-- $$ LANGUAGE plpgsql;