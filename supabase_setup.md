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
  name TEXT,
  student_name TEXT,
  class_section TEXT,
  section TEXT,
  attendance NUMERIC,
  branch TEXT,
  college_assessments JSONB DEFAULT '[]'::jsonb,
  is_synced BOOLEAN DEFAULT false,
  github_username TEXT,
  resume_file_name TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile OR faculty to view all profiles
CREATE POLICY "Users can view own profile or faculty view all"
ON public.profiles FOR SELECT
TO authenticated
USING (
  (auth.uid() = id) OR 
  ((auth.jwt()->'user_metadata'->>'is_faculty')::boolean = true)
);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR ALL
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    roll_number, 
    name, 
    student_name, 
    class_section, 
    section, 
    attendance, 
    branch, 
    college_assessments, 
    is_synced
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'roll_number', ''),
    COALESCE(new.raw_user_meta_data->>'student_name', ''),
    COALESCE(new.raw_user_meta_data->>'student_name', ''),
    COALESCE(new.raw_user_meta_data->>'class_section', ''),
    COALESCE(new.raw_user_meta_data->>'class_section', ''),
    COALESCE((new.raw_user_meta_data->>'attendance')::numeric, 80),
    COALESCE(new.raw_user_meta_data->>'branch', COALESCE(new.raw_user_meta_data->>'department', '')),
    COALESCE(new.raw_user_meta_data->'college_assessments', '[]'::jsonb),
    COALESCE((new.raw_user_meta_data->>'is_synced')::boolean, false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to automatically update a profile when user metadata is updated
CREATE OR REPLACE FUNCTION public.handle_update_user()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET
    roll_number = COALESCE(new.raw_user_meta_data->>'roll_number', roll_number),
    name = COALESCE(new.raw_user_meta_data->>'student_name', name),
    student_name = COALESCE(new.raw_user_meta_data->>'student_name', student_name),
    class_section = COALESCE(new.raw_user_meta_data->>'class_section', class_section),
    section = COALESCE(new.raw_user_meta_data->>'class_section', section),
    attendance = COALESCE((new.raw_user_meta_data->>'attendance')::numeric, attendance),
    branch = COALESCE(new.raw_user_meta_data->>'branch', COALESCE(new.raw_user_meta_data->>'department', branch)),
    college_assessments = COALESCE(new.raw_user_meta_data->'college_assessments', college_assessments),
    is_synced = COALESCE((new.raw_user_meta_data->>'is_synced')::boolean, is_synced),
    github_username = COALESCE(new.raw_user_meta_data->>'github_username', github_username),
    resume_file_name = COALESCE(new.raw_user_meta_data->>'resume_file_name', resume_file_name),
    updated_at = now()
  WHERE id = new.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (old.raw_user_meta_data IS DISTINCT FROM new.raw_user_meta_data)
  EXECUTE FUNCTION public.handle_update_user();
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

## 5. Configure Group Discussion & Proctor Assignments Database (New Tables)

To persist Group Discussion Rooms and Faculty assignments in Supabase, execute the following SQL in your **Supabase SQL Editor**:

```sql
-- A. Create Group Discussion Rooms table (Required for Server real-time state)
CREATE TABLE IF NOT EXISTS public.group_discussion_rooms (
  code TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  participants JSONB DEFAULT '[]'::jsonb NOT NULL,
  dialogue JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at NUMERIC NOT NULL,
  started_at NUMERIC,
  evaluation JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on group_discussion_rooms
ALTER TABLE public.group_discussion_rooms ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to CRUD rooms
CREATE POLICY "Allow authenticated users access to group discussions"
ON public.group_discussion_rooms FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);


-- B. Create table for Faculty Assignments (Interviews & GD Tasks)
CREATE TABLE IF NOT EXISTS public.proctor_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_roll TEXT NOT NULL,
  task_type TEXT CHECK (task_type IN ('interview', 'gd')) NOT NULL,
  topic TEXT NOT NULL,
  difficulty TEXT, -- only for interviews
  room_code TEXT,  -- only for GDs
  completed BOOLEAN DEFAULT false NOT NULL,
  score NUMERIC,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS on proctor_assignments
ALTER TABLE public.proctor_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Proctors can manage their assignments
CREATE POLICY "Proctors can CRUD assignments"
ON public.proctor_assignments FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

---

## 6. Migration & Backfill Existing Profiles Data (SQL Script)

If your `public.profiles` table was created before the schema columns were updated, you will see errors like `column p.name does not exist` when trying to run the update. 

Execute this unified SQL block in your **Supabase SQL Editor**. It will safely alter your existing table to add the missing columns, set up the required RLS policies and trigger functions, and sync your pre-existing student users:

```sql
-- 1. Alter table to add missing columns if they do not exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_section TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS attendance NUMERIC;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS college_assessments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT false;

-- 2. Drop the restrictive select policy if it exists and replace it
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile or faculty view all" ON public.profiles;

CREATE POLICY "Users can view own profile or faculty view all"
ON public.profiles FOR SELECT
TO authenticated
USING (
  (auth.uid() = id) OR 
  ((auth.jwt()->'user_metadata'->>'is_faculty')::boolean = true)
);

-- 3. Replace the update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR ALL
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Recreate the signup trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    roll_number, 
    name, 
    student_name, 
    class_section, 
    section, 
    attendance, 
    branch, 
    college_assessments, 
    is_synced
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'roll_number', ''),
    COALESCE(new.raw_user_meta_data->>'student_name', ''),
    COALESCE(new.raw_user_meta_data->>'student_name', ''),
    COALESCE(new.raw_user_meta_data->>'class_section', ''),
    COALESCE(new.raw_user_meta_data->>'class_section', ''),
    COALESCE((new.raw_user_meta_data->>'attendance')::numeric, 80),
    COALESCE(new.raw_user_meta_data->>'branch', COALESCE(new.raw_user_meta_data->>'department', '')),
    COALESCE(new.raw_user_meta_data->'college_assessments', '[]'::jsonb),
    COALESCE((new.raw_user_meta_data->>'is_synced')::boolean, false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Recreate the metadata update trigger function
CREATE OR REPLACE FUNCTION public.handle_update_user()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET
    roll_number = COALESCE(new.raw_user_meta_data->>'roll_number', roll_number),
    name = COALESCE(new.raw_user_meta_data->>'student_name', name),
    student_name = COALESCE(new.raw_user_meta_data->>'student_name', student_name),
    class_section = COALESCE(new.raw_user_meta_data->>'class_section', class_section),
    section = COALESCE(new.raw_user_meta_data->>'class_section', section),
    attendance = COALESCE((new.raw_user_meta_data->>'attendance')::numeric, attendance),
    branch = COALESCE(new.raw_user_meta_data->>'branch', COALESCE(new.raw_user_meta_data->>'department', branch)),
    college_assessments = COALESCE(new.raw_user_meta_data->'college_assessments', college_assessments),
    is_synced = COALESCE((new.raw_user_meta_data->>'is_synced')::boolean, is_synced),
    github_username = COALESCE(new.raw_user_meta_data->>'github_username', github_username),
    resume_file_name = COALESCE(new.raw_user_meta_data->>'resume_file_name', resume_file_name),
    updated_at = now()
  WHERE id = new.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (old.raw_user_meta_data IS DISTINCT FROM new.raw_user_meta_data)
  EXECUTE FUNCTION public.handle_update_user();

-- 6. Backfill/update existing profile rows from auth user metadata
UPDATE public.profiles p
SET
  name = COALESCE(u.raw_user_meta_data->>'student_name', p.name),
  student_name = COALESCE(u.raw_user_meta_data->>'student_name', p.student_name),
  class_section = COALESCE(u.raw_user_meta_data->>'class_section', p.class_section),
  section = COALESCE(u.raw_user_meta_data->>'class_section', p.section),
  attendance = COALESCE((u.raw_user_meta_data->>'attendance')::numeric, p.attendance),
  branch = COALESCE(u.raw_user_meta_data->>'branch', COALESCE(u.raw_user_meta_data->>'department', p.branch)),
  college_assessments = COALESCE(u.raw_user_meta_data->'college_assessments', p.college_assessments),
  is_synced = COALESCE((u.raw_user_meta_data->>'is_synced')::boolean, p.is_synced),
  github_username = COALESCE(u.raw_user_meta_data->>'github_username', p.github_username),
  resume_file_name = COALESCE(u.raw_user_meta_data->>'resume_file_name', p.resume_file_name)
FROM auth.users u
WHERE p.id = u.id;

-- 7. Performance Optimization Indexes (for 150+ concurrent users scale)
CREATE INDEX IF NOT EXISTS idx_profiles_roll_number ON public.profiles(roll_number);
CREATE INDEX IF NOT EXISTS idx_assignments_student_roll ON public.proctor_assignments(student_roll);
CREATE INDEX IF NOT EXISTS idx_assignments_proctor_id ON public.proctor_assignments(proctor_id);

-- 8. User Deletion Cleanup Trigger
-- Run this SQL block to automatically wipe a student's profile and proctor assignments
-- when their user account is deleted from auth.users.
CREATE OR REPLACE FUNCTION public.handle_deleted_user()
RETURNS TRIGGER AS $$
DECLARE
  v_roll TEXT;
BEGIN
  -- 1. Grab the roll number of the student before their profile is deleted
  SELECT roll_number INTO v_roll FROM public.profiles WHERE id = old.id;

  -- 2. Delete the profile row
  DELETE FROM public.profiles WHERE id = old.id;

  -- 3. Delete any proctor assignments associated with this student's roll number
  IF v_roll IS NOT NULL AND v_roll <> '' THEN
    DELETE FROM public.proctor_assignments WHERE student_roll = v_roll;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deleted_user();
```

// Modified by Database Engineer agent for Task run-3e9897-IC-101 at 2026-07-07 11:12:48
