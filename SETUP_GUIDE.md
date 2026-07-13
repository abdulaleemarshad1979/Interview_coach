# Complete Setup Guide for Interview Coach with Admin Dashboard

## Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Supabase account (free tier works)

---

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" or "Sign Up"
3. Create a new project:
   - Name it "Interview Coach"
   - Choose a region closest to you
   - Set a secure password for the database
   - Wait for the project to be provisioned (2-5 minutes)

---

## Step 2: Get Your Supabase Credentials

1. In your Supabase dashboard, go to **Project Settings** → **API**
2. Copy the following:
   - **Project URL** (e.g., `https://your-project-ref.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

---

## Step 3: Configure Environment Variables

1. In your project root, create a `.env` file (or rename `.env.example` to `.env`):
```bash
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key-here"

SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_ANON_KEY="your-anon-key-here"
```

2. Replace the placeholder values with your actual Supabase credentials

---

## Step 4: Enable Admin API Access (Important!)

The admin dashboard uses `supabase.auth.admin.listUsers()` which requires special permissions.

### Option A: Using Supabase Dashboard (Recommended)

1. In your Supabase dashboard, go to **Authentication** → **Users**
2. Click the **Settings** tab
3. Under "User registration", ensure:
   - ✅ Enable email confirmations (optional)
   - ✅ Allow new registrations

### Option B: Using SQL Editor for Row Level Security

1. Go to **SQL Editor** in Supabase dashboard
2. Run this query to enable RLS on auth.users (if needed):
```sql
-- Note: This is typically not needed as auth schema is managed by Supabase
```

---

## Step 5: Install Dependencies

In your project root directory:
```bash
npm install
```

---

## Step 6: Run the Development Server

```bash
npm run dev
```

The app should now be running at `http://localhost:5173` (or the port shown in terminal).

---

## Step 7: Test the Admin Dashboard Feature

### Creating a Student Account:
1. Go to `http://localhost:5173/login`
2. Click "Create Account"
3. Fill in:
   - Roll Number: e.g., `24P31A1234`
   - Email: e.g., `student@university.edu`
   - Password: minimum 6 characters
4. Submit the form

### Creating a Faculty Account (Required for Assignment):
1. Go to Supabase Dashboard → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Fill in:
   - Email: e.g., `faculty@university.edu`
   - Password: secure password
   - Under "User metadata", add:
     ```json
     {
       "roll_number": "",
       "role": "faculty"
     }
     ```
4. Click **Create user**

### Testing the Admin Dashboard:
1. Log in as admin (or create an admin account with roll number `admin`)
2. Navigate to **Admin Dashboard**
3. You should see the new student registration in the "Pending Registrations" list
4. Select a faculty member from the dropdown
5. Click the green checkmark to assign

---

## Step 8: Verify Everything Works

### Check if Pending Registrations Show:
1. Register a new student account
2. Log in as admin
3. Go to Admin Dashboard
4. You should see the student in "Pending Registrations"

### Check if Faculty Assignment Works:
1. After assigning a faculty member, the student's card should show "Assigned"
2. The faculty_id is stored in Supabase user metadata

---

## Troubleshooting

### Error: "Supabase credentials not found"
- Make sure `.env` file exists with correct values
- Restart the dev server after creating/editing `.env`

### Error: "Failed to fetch users" or "401 Unauthorized"
- This means the anon key doesn't have permission to list users
- The `supabase.auth.admin.listUsers()` method requires service role permissions
- For development, you can use a service role key (with caution)

**Alternative for Development (No Admin API needed):**
If you don't want to deal with admin permissions, the system will show "No faculty accounts yet" until you create faculty users.

### Error: "Cannot find module" or build errors
```bash
npm install
npm run build
```

---

## Security Notes

⚠️ **Important**: The `supabase.auth.admin.*` methods require service role permissions which should NOT be exposed in client-side code in production.

For production deployment:
1. Use server-side API routes to handle admin operations
2. Never expose service role keys in frontend code
3. Implement proper authentication checks

For development/local testing, the current setup works fine with anon keys that have been granted appropriate permissions.

---

## What Was Implemented

✅ **Pending Registrations Section** - Shows students who registered but haven't been assigned to a faculty member

✅ **Faculty Assignment** - Admin can assign students to faculty members via dropdown

✅ **Dynamic Faculty List** - Fetches actual faculty users from Supabase (filtered by `role="faculty"` in metadata)

✅ **Real-time Updates** - Uses Supabase auth.users as the source of truth

---

## Next Steps

After setup is complete, you can:
1. Create multiple student accounts to test
2. Create faculty accounts with `role: "faculty"` metadata
3. Assign students to faculty members
4. Monitor the system in production
