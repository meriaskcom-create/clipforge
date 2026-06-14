from sqlalchemy.orm import Session

from app.models.user import User

DEMO_CLERK_ID = "local_demo_user"
DEMO_EMAIL = "demo@clipforge.local"


def get_or_create_demo_user(db: Session) -> User:
    user = db.query(User).filter(User.clerk_user_id == DEMO_CLERK_ID).first()
    if user:
        return user

    user = User(
        clerk_user_id=DEMO_CLERK_ID,
        email=DEMO_EMAIL,
        full_name="Local Demo User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
