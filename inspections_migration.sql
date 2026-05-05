-- Run this in your MySQL database

CREATE TABLE IF NOT EXISTS inspections (
  id              CHAR(36)      PRIMARY KEY,
  property_id     CHAR(36)      NOT NULL,
  type            ENUM('fire_alarm','communal_area','cleaning','garden_exterior','full_property','hmo_compliance') NOT NULL,
  inspector_name  VARCHAR(255)  NOT NULL,
  inspection_date DATE          NOT NULL,
  overall_result  ENUM('pass','fail','issues_noted') NOT NULL DEFAULT 'pass',
  notes           TEXT,
  created_by      CHAR(36)      NOT NULL,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inspection_items (
  id             CHAR(36)     PRIMARY KEY,
  inspection_id  CHAR(36)     NOT NULL,
  item_label     VARCHAR(255) NOT NULL,
  result         ENUM('pass','fail','na') NOT NULL DEFAULT 'pass',
  notes          TEXT,
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inspection_photos (
  id             CHAR(36)     PRIMARY KEY,
  inspection_id  CHAR(36)     NOT NULL,
  storage_path   VARCHAR(500) NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
