use rusqlite::Connection;
use std::sync::Mutex;
use std::time::Instant;
use std::path::PathBuf;
use zeroize::Zeroize;

pub struct MasterKey(pub [u8; 32]);

impl Drop for MasterKey {
    fn drop(&mut self) { self.0.zeroize(); }
}

pub struct AppState {
    pub master_key: Mutex<Option<MasterKey>>,
    pub db: Mutex<Connection>,
    pub db_path: Mutex<PathBuf>,
    pub last_activity: Mutex<Instant>,
}

impl AppState {
    pub fn new(conn: Connection, db_path: PathBuf) -> Self {
        Self {
            master_key: Mutex::new(None),
            db: Mutex::new(conn),
            db_path: Mutex::new(db_path),
            last_activity: Mutex::new(Instant::now()),
        }
    }

    pub fn touch(&self) {
        *self.last_activity.lock().unwrap() = Instant::now();
    }
}
