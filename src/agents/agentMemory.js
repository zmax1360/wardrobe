export function buildAgentContext({ profile, wardrobe, insights }) {
  return `
User Profile:
${JSON.stringify(profile)}

Wardrobe:
${JSON.stringify(wardrobe.slice(0, 50))}

Insights:
${JSON.stringify(insights)}
`;
}
