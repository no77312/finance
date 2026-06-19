export function activeGroupFor(state) {
  const groups = state.data?.groups ?? []
  return groups.find((group) => group.id === state.activeGroupID) ?? groups[0] ?? null
}
