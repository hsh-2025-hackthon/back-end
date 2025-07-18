-- Create expenses table
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    base_amount DECIMAL(15, 2) NOT NULL,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    exchange_rate DECIMAL(12, 6) DEFAULT 1.0,
    category VARCHAR(50) CHECK (category IN ('transportation', 'accommodation', 'food', 'activities', 'shopping', 'other')) NOT NULL,
    subcategory VARCHAR(100),
    tags JSONB DEFAULT '[]',
    expense_date DATE NOT NULL,
    expense_time TIME,
    location JSONB DEFAULT '{}',
    participants JSONB NOT NULL DEFAULT '[]',
    split_method VARCHAR(20) CHECK (split_method IN ('equal', 'percentage', 'custom', 'shares', 'none')) DEFAULT 'equal',
    split_data JSONB DEFAULT '{}',
    receipt_urls JSONB DEFAULT '[]',
    ocr_data JSONB DEFAULT '{}',
    status VARCHAR(20) CHECK (status IN ('active', 'cancelled', 'merged')) DEFAULT 'active',
    verification_status VARCHAR(20) CHECK (verification_status IN ('pending', 'verified', 'disputed')) DEFAULT 'pending',
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT positive_amount CHECK (amount > 0),
    CONSTRAINT positive_base_amount CHECK (base_amount > 0),
    CONSTRAINT positive_exchange_rate CHECK (exchange_rate > 0)
);

-- Create expense splits table
CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    base_amount DECIMAL(15, 2) NOT NULL,
    base_currency VARCHAR(3) NOT NULL,
    percentage DECIMAL(5, 2),
    shares INTEGER,
    status VARCHAR(20) CHECK (status IN ('pending', 'paid', 'cancelled', 'disputed')) DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    notes TEXT,
    due_date DATE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT positive_amount CHECK (amount > 0),
    CONSTRAINT positive_base_amount CHECK (base_amount > 0),
    CONSTRAINT valid_percentage CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
    CONSTRAINT positive_shares CHECK (shares IS NULL OR shares > 0),
    
    UNIQUE(expense_id, user_id)
);

-- Create expense categories table (for custom categories)
CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7), -- hex color code
    icon VARCHAR(50),
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(trip_id, name)
);

-- Create budgets table
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category VARCHAR(100),
    total_amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    base_amount DECIMAL(15, 2) NOT NULL,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    spent_amount DECIMAL(15, 2) DEFAULT 0,
    alert_threshold DECIMAL(5, 2) DEFAULT 80.0, -- percentage
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT positive_total_amount CHECK (total_amount > 0),
    CONSTRAINT positive_base_amount CHECK (base_amount > 0),
    CONSTRAINT valid_alert_threshold CHECK (alert_threshold >= 0 AND alert_threshold <= 100),
    CONSTRAINT non_negative_spent CHECK (spent_amount >= 0),
    
    UNIQUE(trip_id, category)
);

-- Create budget alerts table
CREATE TABLE budget_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    alert_type VARCHAR(30) CHECK (alert_type IN ('threshold_exceeded', 'budget_exceeded', 'approaching_limit')) NOT NULL,
    threshold_percentage DECIMAL(5, 2),
    amount_exceeded DECIMAL(15, 2),
    message TEXT,
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_payer_id ON expenses(payer_id);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_verification_status ON expenses(verification_status);
CREATE INDEX idx_expenses_amount ON expenses(base_amount);

CREATE INDEX idx_expense_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_user_id ON expense_splits(user_id);
CREATE INDEX idx_expense_splits_payer_id ON expense_splits(payer_id);
CREATE INDEX idx_expense_splits_status ON expense_splits(status);
CREATE INDEX idx_expense_splits_due_date ON expense_splits(due_date);

CREATE INDEX idx_expense_categories_trip_id ON expense_categories(trip_id);
CREATE INDEX idx_expense_categories_name ON expense_categories(name);

CREATE INDEX idx_budgets_trip_id ON budgets(trip_id);
CREATE INDEX idx_budgets_category ON budgets(category);
CREATE INDEX idx_budgets_created_by ON budgets(created_by);

CREATE INDEX idx_budget_alerts_budget_id ON budget_alerts(budget_id);
CREATE INDEX idx_budget_alerts_type ON budget_alerts(alert_type);
CREATE INDEX idx_budget_alerts_acknowledged ON budget_alerts(is_acknowledged);

-- Create triggers
CREATE TRIGGER update_expenses_updated_at 
    BEFORE UPDATE ON expenses 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_splits_updated_at 
    BEFORE UPDATE ON expense_splits 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at 
    BEFORE UPDATE ON budgets 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
