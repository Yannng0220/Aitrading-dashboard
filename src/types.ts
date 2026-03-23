export interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  action: 'ENTRY' | 'EXIT';
  positionSide?: 'LONG' | 'SHORT';
  price: number;
  amount: number;
  leverage?: number;
  fee: number;
  realizedPL?: number;
  reason: string;
}

export interface Position {
  symbol: string;
  amount: number;
  avgEntryPrice: number;
  leverage: number;
  unrealizedPL: number;
  side: 'LONG' | 'SHORT';
}

export interface Agent {
  id: number;
  name: string;
  strategy: string;
  strategyType: string;
  balance: number;
  activePositions: Record<string, Position>;
  equity: number;
  unrealizedPL: number; // Total Floating profit/loss
  trades: Trade[];
  performance: number; // Percentage change
  color: string;
  status: 'IDLE' | 'BUYING' | 'SELLING';
  strategyParams?: Record<string, any>;
}

export interface MarketData {
  time: string;
  price: number;
  timestamp: number;
}
