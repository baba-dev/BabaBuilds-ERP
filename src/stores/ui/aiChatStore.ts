export type AIChatPayload = {
  query: string;
};

type AIChatStoreState = {
  isOpen: boolean;
  payload: AIChatPayload | null;
  requestId: number;
};

let state: AIChatStoreState = {
  isOpen: false,
  payload: null,
  requestId: 0,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(nextState: AIChatStoreState) {
  state = nextState;
  emit();
}

export function openAIChat(payload: AIChatPayload | null = null) {
  setState({
    isOpen: true,
    payload,
    requestId: state.requestId + 1,
  });
}

export function closeAIChat() {
  setState({
    ...state,
    isOpen: false,
    requestId: state.requestId + 1,
  });
}

export function clearAIChatPayload() {
  setState({
    ...state,
    payload: null,
    requestId: state.requestId + 1,
  });
}

export function subscribeToAIChatStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAIChatStoreSnapshot() {
  return state;
}
