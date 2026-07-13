# Supabase Project Setup Guide

Follow these steps to fully configure your Supabase project for the **Interview Coach** application.

---

## 1. Create a Storage Bucket

You need a storage bucket named `resumes` to store uploaded PDFs.

1. Go to your **Supabase Dashboard**.
2. Click on **Storage** in the left sidebar.
3. Click **New Bucket**.
4. Name the bucket **`resumes`**.
5. Keep it **Private** (recommended) for security, since we use secure signed URLs.
6. Click **Save**.

---

## 2. Configure Storage Policies

In Supabase, policies for storage objects cannot always be executed directly in the SQL Editor due to schema ownership constraints (which causes the `42501: must be owner of table objects` error). Instead, you should configure them using the Supabase Dashboard UI:

### Option A: Secure Private Folder policies (Recommended)
1. Go to **Storage** in the left sidebar of your Supabase dashboard.
2. Click on **Policies** in the storage submenu.
3. Find your **`resumes`** bucket and click **New Policy** -> **Create a policy from scratch**.
4. Create the following policies:

   * **Policy 1: Upload (INSERT)**
     * Name: `Allow authenticated uploads`
     * Allowed operations: Check `INSERT`
     * Target roles: `authenticated`
     * Expression (WITH CHECK):
       ```sql
       bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text
       ```
   * **Policy 2: Read (SELECT)**
     * Name: `Allow users to view own resumes`
     * Allowed operations: Check `SELECT`
     * Target roles: `authenticated`
     * Expression (USING):
       ```sql
       bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text
       ```
   * **Policy 3: Delete (DELETE)**
     * Name: `Allow users to delete own resumes`
     * Allowed operations: Check `DELETE`
     * Target roles: `authenticated`
     * Expression (USING):
       ```sql
       bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text
       ```

### Option B: Quick Testing (Public Bucket)
If you are doing quick testing and want to bypass creating specific policy rules:
1. Go to **Storage** -> Click the three dots next to the **`resumes`** bucket -> Click **Edit Bucket**.
2. Toggle the switch to make it **Public**.
3. Under policies, click **New Policy** -> **Create a policy from scratch**. Give all operations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) `true` or choose "Allow access to everyone" template.


---

## 3. Configure Database (Optional Profiles Table)

If you wish to store user profiles and scorecards in a Postgres database instead of relying purely on `localStorage` and User Metadata, you can create the following tables and RLS (Row Level Security) rules by executing this in the **SQL Editor**:

```sql
-- Create a table for user profiles
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  roll_number TEXT,
  github_username TEXT,
  resume_file_name TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, roll_number)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'roll_number', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 4. Setup Environment Variables

In the root of your project, rename `.env.example` to `.env` (or update your existing `.env` file) and fill in the values:

```env
# Supabase project URL (found under Project Settings -> API)
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"

SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"

# Gemini API Key (found in Google AI Studio)
GEMINI_API_KEY="AIzaSy..."
```

---

## 5. Admin Dashboard Setup (Pending Registrations & Faculty Assignment)

To enable the admin dashboard's pending registrations feature:

### A. Create Faculty Accounts

Faculty accounts need to be created manually in Supabase with a specific metadata field:

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Fill in:
   - Email: e.g., `faculty@university.edu`
   - Password: secure password
4. Under "User metadata", add:
   ```json
   {
     "roll_number": "",
     "role": "faculty"
   }
   ```
5. Click **Create user**

### B. How Faculty Assignment Works

1. When a student registers, their account is stored in Supabase with `user_metadata.roll_number`
2. The admin dashboard fetches all users from `auth.users` and filters for those without `faculty_id`
3. From the "Pending Registrations" list, the admin can:
   - Select a faculty member from the dropdown (populated from users with `role="faculty"`)
   - Click the green checkmark to assign
4. The assignment is saved to the student's `user_metadata.faculty_id`

### C. Testing the Feature

1. Register a new student account via the login page
2. Log in as admin (roll number = "admin")
3. Navigate to **Admin Dashboard**
4. You should see the new registration in the "Pending Registrations" section
5. Select a faculty member and click the green checkmark to assign

### D. Note on Admin Permissions

The admin dashboard uses `supabase.auth.admin.listUsers()` which requires special permissions:
- In development, this works with standard Supabase projects
- For production, consider using server-side API routes for better security

---

## 6. Environment Variables (Complete List)

```env
# Supabase Configuration
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"

SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"

# AI Provider (choose one: groq or ollama)
AI_PROVIDER="groq"

# Groq API Key (if using groq provider)
GROQ_API_KEY="gsk_..."

# Ollama Configuration (if using ollama provider)
OLLAMA_HOST="http://localhost:11434"
OLLAMA_MODEL="qwen3-coder:480b"
```

---

## 7. Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```
