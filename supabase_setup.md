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
