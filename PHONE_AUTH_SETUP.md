# Phone Authentication Setup Guide

## Issue Fixed

✅ **Fixed**: Phone authentication now properly uses E.164 format and supports both password-based and OTP-based auth.

## Supabase Phone Auth Methods

Supabase supports **two methods** for phone authentication:

### Method 1: Phone + Password (Current Implementation)
- User signs up with phone number + password
- User signs in with phone number + password
- **Requires**: Phone authentication with password enabled in Supabase

### Method 2: Phone + OTP (Recommended for Production)
- User enters phone number
- Receives SMS with OTP code
- Verifies OTP to complete signup/signin
- **More secure** and industry standard

## Setup Instructions

### 1. Enable Phone Authentication in Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/ezyrlckumtfmsipwddld
2. Navigate to **Authentication** → **Providers**
3. Enable **Phone** authentication
4. Configure SMS provider (options below)

### 2. Choose SMS Provider

Supabase requires an SMS provider to send verification codes. Options:

#### Option A: Twilio (Most Popular)
1. Sign up at https://twilio.com
2. Get your Account SID and Auth Token
3. In Supabase Dashboard → Phone Settings:
   - Enter Twilio credentials
   - Set up phone number

#### Option B: MessageBird
1. Sign up at https://messagebird.com
2. Get API key
3. Configure in Supabase

#### Option C: Vonage (formerly Nexmo)
1. Sign up at https://vonage.com
2. Get API credentials
3. Configure in Supabase

### 3. Phone Number Format

**All phone numbers must be in E.164 format:**
- Format: `+[country code][number]`
- Examples:
  - US: `+13334445555`
  - Philippines: `+639171234567`
  - UK: `+447911123456`

Our app automatically formats numbers to E.164 (assumes US +1 for 10-digit numbers).

## Code Changes

### New Features Added:

1. **`formatPhoneE164(phone)`** - Automatically formats phone numbers to E.164
2. **`signUpWithOTP(data)`** - OTP-based signup (recommended)
3. **`verifyOTP(data)`** - Verify OTP code
4. **`signUp(data)`** - Password-based signup (requires phone+password auth)
5. **`signIn(data)`** - Password-based signin (requires phone+password auth)

### Using OTP Authentication (Recommended)

**Step 1: Send OTP**
```typescript
import { signUpWithOTP } from '@seva/shared';

const result = await signUpWithOTP({
  phone: '+13334445555',
  full_name: 'John Doe',
  user_type: UserType.CUSTOMER,
});

// Show OTP input screen
```

**Step 2: Verify OTP**
```typescript
import { verifyOTP } from '@seva/shared';

const authData = await verifyOTP({
  phone: '+13334445555',
  token: '123456', // OTP code from SMS
  full_name: 'John Doe',
  user_type: UserType.CUSTOMER,
});

// User is now logged in
```

### Using Password Authentication (Current)

```typescript
import { signUp, signIn } from '@seva/shared';

// Sign up
await signUp({
  phone: '+13334445555',
  password: 'password123',
  full_name: 'John Doe',
  user_type: UserType.CUSTOMER,
});

// Sign in
await signIn({
  phone: '+13334445555',
  password: 'password123',
});
```

## Testing Without SMS Provider

For development without an SMS provider:

### Option 1: Use Email Authentication Temporarily
Switch to email auth in Supabase settings (no SMS provider needed).

### Option 2: Test Phone Numbers
Some SMS providers offer test phone numbers for development.

### Option 3: Disable Phone Verification
In Supabase Dashboard:
- Authentication → Settings → Phone
- Enable "Disable phone confirmation" (development only!)

## Migration Path

If you want to switch from password to OTP:

1. Enable OTP in Supabase
2. Update UI to show OTP input screen
3. Use `signUpWithOTP` and `verifyOTP` functions
4. Update auth screens in both apps

## Security Notes

- ✅ Phone numbers are now properly formatted to E.164
- ✅ Both password and OTP methods are supported
- ⚠️ OTP is more secure (no password to steal)
- ⚠️ Password method requires strong password policy
- ⚠️ Consider adding rate limiting for OTP requests

## Current Status

- ✅ Auth functions support both methods
- ✅ E.164 formatting implemented
- ✅ Type exports added
- ⏳ UI currently uses password method
- ⏳ OTP UI screens need to be created (if switching to OTP)

## Next Steps (Optional)

1. Enable phone auth in Supabase dashboard
2. Set up Twilio account
3. Test with real phone numbers
4. Or switch to email auth for easier testing

