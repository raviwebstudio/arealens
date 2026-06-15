-- AreaLens Database Schema v1.0
-- Run this in Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255),
  phone VARCHAR(20),
  plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'lifetime')),
  uploads_used_this_month INTEGER DEFAULT 0,
  upload_reset_date DATE DEFAULT CURRENT_DATE,
  razorpay_customer_id VARCHAR(255),
  razorpay_subscription_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scans table
CREATE TABLE IF NOT EXISTS scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  property_name VARCHAR(255),
  image_url TEXT,
  image_storage_path TEXT,
  ai_confidence_score DECIMAL(5,2),
  ai_raw_response JSONB,
  rooms JSONB,
  dimensions JSONB,
  unit VARCHAR(10) DEFAULT 'sqft' CHECK (unit IN ('sqft', 'sqm', 'sqyd')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Calculations table
CREATE TABLE IF NOT EXISTS calculations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  carpet_area DECIMAL(10,2),
  wall_area DECIMAL(10,2),
  buildup_area DECIMAL(10,2),
  super_buildup_area DECIMAL(10,2),
  loading_factor DECIMAL(5,2),
  balcony_area DECIMAL(10,2),
  common_area DECIMAL(10,2),
  efficiency_ratio DECIMAL(5,2),
  floor_area_ratio DECIMAL(5,2),
  plot_area DECIMAL(10,2),
  wall_thickness DECIMAL(5,2) DEFAULT 0.15,
  unit VARCHAR(10) DEFAULT 'sqft',
  formula_breakdown JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  razorpay_payment_id VARCHAR(255),
  razorpay_order_id VARCHAR(255),
  razorpay_subscription_id VARCHAR(255),
  plan VARCHAR(20),
  amount INTEGER,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  payment_type VARCHAR(20) CHECK (payment_type IN ('subscription', 'lifetime')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_calculations_user_id ON calculations(user_id);
CREATE INDEX IF NOT EXISTS idx_calculations_scan_id ON calculations(scan_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- Auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER scans_updated_at BEFORE UPDATE ON scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
