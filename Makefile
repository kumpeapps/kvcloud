.PHONY: help build up down logs clean test backend-shell frontend-shell db-shell

help:
	@echo "KVCloud Makefile Commands:"
	@echo "  make build          - Build Docker containers"
	@echo "  make up             - Start services (production)"
	@echo "  make up-dev         - Start services (development)"
	@echo "  make down           - Stop services"
	@echo "  make logs           - View logs"
	@echo "  make clean          - Remove containers and volumes"
	@echo "  make test           - Run tests"
	@echo "  make backend-shell  - Access backend container shell"
	@echo "  make frontend-shell - Access frontend container shell"
	@echo "  make db-shell       - Access database shell"
	@echo "  make migrate        - Run database migrations"

build:
	docker-compose build

up:
	docker-compose up -d

up-dev:
	docker-compose -f docker-compose.dev.yml up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	rm -rf backend/__pycache__ backend/**/__pycache__
	rm -rf frontend/node_modules frontend/dist

test:
	@echo "Running backend tests..."
	cd backend && pytest
	@echo "Running frontend tests..."
	cd frontend && npm test

backend-shell:
	docker exec -it kvcloud-backend /bin/bash

frontend-shell:
	docker exec -it kvcloud-frontend /bin/sh

db-shell:
	docker exec -it kvcloud-db psql -U kvcloud -d kvcloud

migrate:
	docker exec -it kvcloud-backend alembic upgrade head

migrate-create:
	@read -p "Enter migration message: " msg; \
	docker exec -it kvcloud-backend alembic revision --autogenerate -m "$$msg"
