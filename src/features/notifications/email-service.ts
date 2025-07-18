// Note: This is a mock implementation. In production, you would install nodemailer or similar
// and implement the actual email service integration

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  data?: Record<string, any>;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }[];
}

export interface EmailTemplate {
  name: string;
  subject: string;
  html: string;
  variables: string[];
}

export class EmailService {
  private isInitialized = false;
  private templates: Map<string, EmailTemplate> = new Map();

  constructor() {
    this.initializeMockService();
    this.loadTemplates();
  }

  private initializeMockService(): void {
    // Mock initialization - in production this would initialize nodemailer/SES/etc
    this.isInitialized = !!(process.env.SMTP_HOST || process.env.AWS_SES_REGION);
    console.log('[EmailService] Mock service initialized');
  }

  private loadTemplates(): void {
    // Load default templates
    const defaultTemplates: EmailTemplate[] = [
      {
        name: 'trip_invitation',
        subject: 'You\'ve been invited to join {{tripName}}',
        html: `
          <html>
            <body>
              <h1>Trip Invitation</h1>
              <p>Hi {{userName}},</p>
              <p>You've been invited to join the trip "{{tripName}}" by {{inviterName}}.</p>
              <p>Click <a href="{{inviteLink}}">here</a> to accept the invitation.</p>
              <p>Happy travels!</p>
            </body>
          </html>
        `,
        variables: ['userName', 'tripName', 'inviterName', 'inviteLink'],
      },
      {
        name: 'budget_alert',
        subject: 'Budget Alert: {{tripName}}',
        html: `
          <html>
            <body>
              <h1>Budget Alert</h1>
              <p>Hi {{userName}},</p>
              <p>The trip "{{tripName}}" has exceeded {{percentage}}% of its budget.</p>
              <p>Current spending: {{currentSpending}} / {{totalBudget}}</p>
              <p>Click <a href="{{tripLink}}">here</a> to view trip details.</p>
            </body>
          </html>
        `,
        variables: ['userName', 'tripName', 'percentage', 'currentSpending', 'totalBudget', 'tripLink'],
      },
      {
        name: 'expense_split',
        subject: 'New expense split: {{expenseName}}',
        html: `
          <html>
            <body>
              <h1>Expense Split</h1>
              <p>Hi {{userName}},</p>
              <p>A new expense "{{expenseName}}" has been split in "{{tripName}}".</p>
              <p>Your share: {{userAmount}}</p>
              <p>Total expense: {{totalAmount}}</p>
              <p>Click <a href="{{expenseLink}}">here</a> to view details.</p>
            </body>
          </html>
        `,
        variables: ['userName', 'expenseName', 'tripName', 'userAmount', 'totalAmount', 'expenseLink'],
      },
      {
        name: 'vote_request',
        subject: 'Vote requested for {{voteTitle}}',
        html: `
          <html>
            <body>
              <h1>Vote Request</h1>
              <p>Hi {{userName}},</p>
              <p>A new vote has been created for "{{voteTitle}}" in trip "{{tripName}}".</p>
              <p>{{voteDescription}}</p>
              <p>Click <a href="{{voteLink}}">here</a> to cast your vote.</p>
            </body>
          </html>
        `,
        variables: ['userName', 'voteTitle', 'tripName', 'voteDescription', 'voteLink'],
      },
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.name, template);
    });
  }

  async sendEmail(payload: EmailPayload): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[EmailService] Service not initialized, skipping email');
      return;
    }

    try {
      // Mock implementation - in production this would send via nodemailer/SES
      console.log('[EmailService] Mock email sent:', {
        to: payload.to,
        subject: payload.subject,
        hasAttachments: !!(payload.attachments && payload.attachments.length > 0),
        dataKeys: payload.data ? Object.keys(payload.data) : [],
      });
      
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      throw error;
    }
  }

  async sendTemplatedEmail(templateName: string, to: string, variables: Record<string, string>): Promise<void> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Email template '${templateName}' not found`);
    }

    // Replace variables in subject and html
    let subject = template.subject;
    let html = template.html;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), value);
      html = html.replace(new RegExp(placeholder, 'g'), value);
    }

    await this.sendEmail({
      to,
      subject,
      html,
      data: variables,
    });
  }

  async sendBulkEmail(recipients: string[], payload: Omit<EmailPayload, 'to'>): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[EmailService] Service not initialized, skipping bulk email');
      return;
    }

    try {
      // Mock implementation - in production this would use bulk email API
      console.log('[EmailService] Mock bulk email sent:', {
        recipientCount: recipients.length,
        subject: payload.subject,
      });
      
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error('[EmailService] Failed to send bulk email:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
    const html = `
      <html>
        <body>
          <h1>Welcome to Travel Planner!</h1>
          <p>Hi ${userName},</p>
          <p>Welcome to our collaborative travel planning platform. You can now create trips, invite friends, and plan amazing journeys together.</p>
          <p>Get started by creating your first trip!</p>
          <p>Happy travels!</p>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: userEmail,
      subject: 'Welcome to Travel Planner!',
      html,
    });
  }

  async sendPasswordResetEmail(userEmail: string, resetToken: string): Promise<void> {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const html = `
      <html>
        <body>
          <h1>Password Reset</h1>
          <p>You requested a password reset for your Travel Planner account.</p>
          <p>Click <a href="${resetLink}">here</a> to reset your password.</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this reset, please ignore this email.</p>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: userEmail,
      subject: 'Password Reset - Travel Planner',
      html,
    });
  }

  async sendTripInvitation(inviteeEmail: string, inviteeName: string, tripName: string, inviterName: string, inviteToken: string): Promise<void> {
    const inviteLink = `${process.env.FRONTEND_URL}/trip/invite?token=${inviteToken}`;
    
    await this.sendTemplatedEmail('trip_invitation', inviteeEmail, {
      userName: inviteeName,
      tripName,
      inviterName,
      inviteLink,
    });
  }

  async sendBudgetAlert(userEmail: string, userName: string, tripName: string, percentage: number, currentSpending: number, totalBudget: number, tripId: string): Promise<void> {
    const tripLink = `${process.env.FRONTEND_URL}/trip/${tripId}`;
    
    await this.sendTemplatedEmail('budget_alert', userEmail, {
      userName,
      tripName,
      percentage: percentage.toString(),
      currentSpending: currentSpending.toFixed(2),
      totalBudget: totalBudget.toFixed(2),
      tripLink,
    });
  }

  async sendExpenseSplitNotification(userEmail: string, userName: string, expenseName: string, tripName: string, userAmount: number, totalAmount: number, expenseId: string): Promise<void> {
    const expenseLink = `${process.env.FRONTEND_URL}/expense/${expenseId}`;
    
    await this.sendTemplatedEmail('expense_split', userEmail, {
      userName,
      expenseName,
      tripName,
      userAmount: userAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      expenseLink,
    });
  }

  async sendVoteRequest(userEmail: string, userName: string, voteTitle: string, voteDescription: string, tripName: string, voteId: string): Promise<void> {
    const voteLink = `${process.env.FRONTEND_URL}/vote/${voteId}`;
    
    await this.sendTemplatedEmail('vote_request', userEmail, {
      userName,
      voteTitle,
      tripName,
      voteDescription,
      voteLink,
    });
  }

  getAvailableTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  addTemplate(template: EmailTemplate): void {
    this.templates.set(template.name, template);
    console.log(`[EmailService] Added template: ${template.name}`);
  }

  removeTemplate(templateName: string): boolean {
    const deleted = this.templates.delete(templateName);
    if (deleted) {
      console.log(`[EmailService] Removed template: ${templateName}`);
    }
    return deleted;
  }

  isAvailable(): boolean {
    return this.isInitialized;
  }

  getHealth(): { status: string; initialized: boolean; templateCount: number } {
    return {
      status: this.isInitialized ? 'healthy' : 'unavailable',
      initialized: this.isInitialized,
      templateCount: this.templates.size,
    };
  }
}
