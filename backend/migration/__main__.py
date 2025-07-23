import db
import os

MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "bourracho_api_test")

if __name__ == "__main__":
    db.update_conversations_collections(from_db=MONGO_DB_NAME, to_db=MONGO_DB_NAME + "_0_2b")
