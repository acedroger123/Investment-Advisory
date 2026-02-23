"""
Auth helpers for enforcing per-user scoping in portfolio routes.
"""
from fastapi import Header, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from portfolio_backend.database.models import User, Goal


def get_current_pg_user_id(
    x_user_id: str | None = Header(default=None, alias="x-user-id"),
    user_id: int | None = Query(default=None)
) -> int:
    """
    Resolve authenticated PostgreSQL app user id from proxy context.
    Primary: x-user-id header. Fallback: user_id query parameter.
    """
    candidate = x_user_id if x_user_id is not None else user_id
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    try:
        pg_user_id = int(candidate)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user context")

    if pg_user_id <= 0:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user context")

    return pg_user_id


def get_or_create_pa_user(db: Session, pg_user_id: int) -> User:
    """
    Map app user (newusers.id) to pa_users row.
    """
    user = db.query(User).filter(User.pg_user_id == pg_user_id).order_by(User.id.asc()).first()
    if user:
        return user

    profile = db.execute(
        text("SELECT name, email FROM newusers WHERE id = :pg_user_id"),
        {"pg_user_id": pg_user_id}
    ).mappings().first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")

    # Backward compatibility: attach old pa_users row (created pre-pg_user_id linkage)
    # to the right app user when email/username matches.
    profile_email = str(profile.get("email") or "").strip().lower()
    profile_name = str(profile.get("name") or "").strip().lower()

    legacy_user = None
    if profile_email:
      legacy_user = (
          db.query(User)
          .filter(User.pg_user_id.is_(None), func.lower(User.email) == profile_email)
          .order_by(User.id.asc())
          .first()
      )

    if not legacy_user and profile_name:
      legacy_user = (
          db.query(User)
          .filter(User.pg_user_id.is_(None), func.lower(User.username) == profile_name)
          .order_by(User.id.asc())
          .first()
      )

    # Final fallback: migrate single legacy demo_user once.
    if not legacy_user:
      demo_candidate = (
          db.query(User)
          .filter(User.pg_user_id.is_(None), User.username == "demo_user")
          .order_by(User.id.asc())
          .first()
      )
      if demo_candidate:
          linked_users_count = db.query(User).filter(User.pg_user_id.isnot(None)).count()
          if linked_users_count == 0:
              legacy_user = demo_candidate

    if legacy_user:
      legacy_user.pg_user_id = pg_user_id
      db.commit()
      db.refresh(legacy_user)
      return legacy_user

    username = f"pa_user_{pg_user_id}"
    email = f"pa_user_{pg_user_id}@local.invalid"

    user = User(username=username, email=email, pg_user_id=pg_user_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_goal_for_pg_user(db: Session, goal_id: int, pg_user_id: int) -> Goal | None:
    """
    Fetch goal only if it belongs to the authenticated user.
    """
    return (
        db.query(Goal)
        .join(User, Goal.user_id == User.id)
        .filter(Goal.id == goal_id, User.pg_user_id == pg_user_id)
        .first()
    )
