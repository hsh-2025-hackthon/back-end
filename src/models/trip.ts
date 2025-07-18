export interface Trip {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  destination: any; // Using 'any' for now, will refine later
  budget: number;
  currency: string;
  status: 'planning' | 'in-progress' | 'completed';
  createdBy: string; // User ID
}
