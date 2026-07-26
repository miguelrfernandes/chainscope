# Justfile for ChainScope project

set shell := ["bash", "-uc"]

# List available commands
default:
    @just --list

# --- Local Development ---

# Run the frontend dev server
dev-frontend:
    cd frontend && npm run dev

# Kill any process listening on backend port 8000
kill-port:
    -lsof -ti :8000 | xargs kill -9 2>/dev/null || true

# Run the backend dev server (uvicorn)
dev-backend: kill-port
    cd backend && uv run uvicorn app.main:app --reload --port 8000

# Run both backend and frontend concurrently
dev:
    @echo "Starting backend and frontend..."
    (trap 'kill 0' SIGINT; just dev-backend & just dev-frontend & wait)

# --- Building & Verification ---

# Build the frontend production bundle
build-frontend:
    npm --prefix frontend run build

# Run all tests (frontend + backend)
test: test-frontend test-backend

# Run frontend tests
test-frontend:
    cd frontend && npm run test

# Run backend tests
test-backend:
    cd backend && uv run pytest

# --- Evals ---

# Push backend/evals/gold_dataset.json to the LangSmith "chainscope-gold" dataset
eval-upload:
    cd backend && uv run --group evals python -m evals.upload_dataset

# Run the gold Q&A dataset against the live agent graph via LangSmith (requires LANGCHAIN_API_KEY)
eval-gold: eval-upload
    cd backend && uv run --group evals python -m evals.run_eval

# --- Linting & Formatting ---

# Run all linters
lint: lint-frontend lint-backend

# Run frontend linter
lint-frontend:
    cd frontend && npm run lint

# Run backend linter
lint-backend:
    cd backend && uv run ruff check .

# Format code automatically
format: format-backend

# Format backend code
format-backend:
    cd backend && uv run ruff format . && uv run ruff check --fix .

# Install all dependencies (frontend + backend)
install:
    cd frontend && npm install
    cd backend && uv sync

