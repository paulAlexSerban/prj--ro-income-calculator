.PHONY: backup up down

BACKUP_DIR := backups
BACKUP_FILE := $(BACKUP_DIR)/offercompare.sql
BACKUP_TMP := $(BACKUP_FILE).tmp

backup:
	mkdir -p $(BACKUP_DIR)
	docker compose up -d db --wait
	docker compose exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' > $(BACKUP_TMP)
	test -s $(BACKUP_TMP)
	mv $(BACKUP_TMP) $(BACKUP_FILE)

down:
	mkdir -p $(BACKUP_DIR)
	docker compose up -d db --wait
	if [ -s $(BACKUP_FILE) ]; then \
		cp $(BACKUP_FILE) $(BACKUP_DIR)/offercompare-$$(date +%Y%m%d-%H%M%S).sql; \
	fi
	docker compose exec -T db sh -c 'pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' > $(BACKUP_TMP)
	test -s $(BACKUP_TMP)
	mv $(BACKUP_TMP) $(BACKUP_FILE)
	docker compose down

up:
	docker compose stop api web || true
	docker compose up -d db --wait
	if [ -s $(BACKUP_FILE) ]; then \
		docker compose exec -T db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -v ON_ERROR_STOP=1' < $(BACKUP_FILE); \
	fi
	docker compose up -d --wait
