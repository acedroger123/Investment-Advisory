from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from fastapi.middleware.cors import CORSMiddleware
from database import engine, SessionLocal
from models import Base, User, SurveyResponse
from schemas import UserCreate, SurveyCreate
from fastapi import HTTPException, Depends
from schemas import UserCreate
from schemas import UserLogin
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey


app = FastAPI()
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")
Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_password(password):
    return pwd_context.hash(password)

@app.post("/signup")
def signup(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(
        username=user.username,
        password_hash=hash_password(user.password)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "User registered successfully",
        "user_id": new_user.user_id
    }
@app.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()

    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {
        "message": "Login successful",
        "user_id": db_user.user_id
    }


@app.post("/submit-survey/{user_id}")
def submit_survey(user_id: int, survey: SurveyCreate, db: Session = Depends(get_db)):
    response = SurveyResponse(user_id=user_id, **survey.dict())
    db.add(response)
    db.commit()
    return {"message": "Survey saved"}

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

