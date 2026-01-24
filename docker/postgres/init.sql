-- Initialize the scheduling databases and app user
-- This script runs on first container start

-- Create test database
CREATE DATABASE scheduling_test;

-- Create app user without BYPASSRLS (for RLS enforcement)
CREATE USER scheduling_app WITH PASSWORD 'scheduling';

-- Grant permissions on main database
GRANT CONNECT ON DATABASE scheduling TO scheduling_app;
GRANT ALL PRIVILEGES ON DATABASE scheduling TO scheduling_app;
\c scheduling
GRANT ALL ON SCHEMA public TO scheduling_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO scheduling_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO scheduling_app;

-- Grant permissions on test database
\c scheduling_test
GRANT ALL ON SCHEMA public TO scheduling_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO scheduling_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO scheduling_app;

-- Grant database-level permissions
\c postgres
GRANT ALL PRIVILEGES ON DATABASE scheduling_test TO scheduling_app;
