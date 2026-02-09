-- Initialize the scheduling databases and app user
-- This script runs on first container start

-- Create test database
CREATE DATABASE scheduling_test;
CREATE DATABASE svix;

-- Create app user without BYPASSRLS (for RLS enforcement)
CREATE USER scheduling_app WITH PASSWORD 'scheduling';
CREATE USER svix_app WITH PASSWORD 'svix';

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

-- Grant permissions on svix database
\c svix
GRANT CONNECT ON DATABASE svix TO svix_app;
GRANT ALL PRIVILEGES ON DATABASE svix TO svix_app;
GRANT ALL ON SCHEMA public TO svix_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO svix_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO svix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO svix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO svix_app;
GRANT ALL ON SCHEMA public TO scheduling_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO scheduling_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO scheduling_app;

-- Grant database-level permissions
\c postgres
GRANT ALL PRIVILEGES ON DATABASE scheduling_test TO scheduling_app;
GRANT ALL PRIVILEGES ON DATABASE svix TO scheduling_app;
GRANT ALL PRIVILEGES ON DATABASE svix TO svix_app;
