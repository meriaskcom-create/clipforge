ClipForge OTP/Auth Recovery Patch

Replace these files in your project:

1) backend/app/api/auth.py
2) frontend/app/login/page.tsx
3) frontend/app/verify-email/page.tsx

What this patch fixes:
- If a user signs up but closes OTP page, same email signup will not get stuck.
- Existing unverified account signup updates password/name, sends a fresh OTP, and redirects to OTP page.
- Unverified login now sends fresh OTP and redirects to OTP page instead of blocking user.
- Verify OTP has small validation and Resend OTP 60s cooldown.
- OTP expiry comparison is made safer for timezone-aware/naive database values.

After replacing files:
Backend:
  cd backend
  python -m uvicorn app.main:app --reload

Frontend:
  cd frontend
  npm run dev

Test flow:
1) Signup with new email -> should go to /verify-email and send OTP.
2) Close OTP page without verifying.
3) Signup again with same email -> should send new OTP and go to /verify-email.
4) Login with same unverified email -> should send new OTP and go to /verify-email.
5) Verify OTP -> should go to dashboard.
