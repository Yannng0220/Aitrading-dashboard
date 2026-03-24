import { Agent } from '../types';

export function compareAgentsByDashboardRank(a: Agent, b: Agent) {
  if (b.performance !== a.performance) return b.performance - a.performance;
  if (b.equity !== a.equity) return b.equity - a.equity;
  return a.id - b.id;
}

export function getDashboardRankedAgents(agents: Agent[]) {
  return agents.slice().sort(compareAgentsByDashboardRank);
}
