export interface PropertySchema {
  type?: string;
  faker?: string;
  fakerArgs?: unknown[];
  enum?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, PropertySchema>;
}

export interface ResourceSchema {
  type?: string;
  properties?: Record<string, PropertySchema>;
}
