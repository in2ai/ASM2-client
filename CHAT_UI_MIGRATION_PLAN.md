# ASM2 Chat UI Migration Plan

## Goal
Migrate the enterprise chat UI into `ASM2-client/dashboard-ts-router` and reuse `mecopia` as a UX reference only. Keep a single web frontend stack, the existing Logto auth flow, and the current FastAPI backend as the system of record.

## Core decisions
- Build the new chat inside `dashboard-ts-router`
- Reuse existing Logto SPA authentication and callback flow
- Reuse the existing FastAPI backend and extend it as needed
- Use `mecopia` for layout, interaction, and UX inspiration
- Do not keep Angular as a separate production webapp
- Do not mechanically port Angular services, sockets, or Electron code

## Target architecture
### Frontend
- Route: `/chat` inside `dashboard-ts-router`
- New feature area:
  - `src/features/chat/components`
  - `src/features/chat/hooks`
  - `src/features/chat/lib`
  - `src/features/chat/types.ts`
- Reuse existing SPA providers:
  - Logto auth
  - TanStack Router
  - React Query
  - theme and shared UI components

### Backend
Extend FastAPI from the current minimal `/chat` behavior toward a conversation-oriented API.

Recommended API shape:
- `GET /chats` — list user conversations
- `POST /chats` — create conversation
- `GET /chats/{id}` — get conversation and messages
- `POST /chats/{id}/messages` — submit user message and get assistant reply
- Later: streaming endpoint using SSE

## Phase 0 — Lock scope
- Confirm React SPA is the only target frontend
- Confirm mecopia is a UX reference, not a runtime dependency
- Confirm chat uses existing Logto and backend integration model
- Write and share this decision with the team

## Phase 1 — Audit mecopia
Review and classify features into three groups.

### Reuse as UX ideas
- chat layout
- sidebar/chat list
- message bubbles
- composer behavior
- loading/waiting state
- auto-scroll and scroll-to-bottom behavior
- mobile responsiveness
- empty and error states

### Rebuild differently in ASM2
- auth and token handling
- routing and guards
- data fetching and state management
- real-time transport model
- profile-related logic

### Defer initially
- offers/dialog workflows
- advanced attachment flows
- push notifications
- Electron-specific behavior
- socket-heavy features that are not required for MVP

## Phase 2 — Define the React chat module
Create a component plan before implementation.

Suggested components:
- `ChatPage`
- `ChatShell`
- `ChatSidebar`
- `ConversationView`
- `MessageList`
- `MessageBubble`
- `ChatComposer`
- `ChatEmptyState`
- `ChatLoadingState`
- `ScrollToBottomButton`

Suggested state split:
- server state: chats, messages, responses
- UI state: selected chat, composer text, sidebar state, loading state
- session state: authenticated user and access token

## Phase 3 — Define the backend contract
The current `GET /chat?query=...&chat_id=...` endpoint is too thin for a production chat UI.

Define request/response models for:
- chat summary
- chat detail
- message
- send message result
- error states

Minimum fields for messages:
- `id`
- `chat_id`
- `role`
- `content`
- `created_at`
- optional `status` and `metadata`

Minimum fields for chats:
- `id`
- `title`
- `created_at`
- `updated_at`
- optional `last_message_preview`

## Phase 4 — Build the routed chat shell
- Add `/chat` route in `dashboard-ts-router`
- Add chat entry to the SPA navigation
- Render authenticated chat page shell
- Reuse existing app layout, theme, and responsive patterns
- Add placeholders for sidebar, message area, and composer

## Phase 5 — Deliver MVP without streaming
First complete flow:
1. open `/chat`
2. create or select a conversation
3. type a message
4. send request to FastAPI
5. receive final assistant response
6. display both user and assistant messages

Frontend tasks:
- implement composer and message list
- support enter-to-send and shift+enter newline
- show sending state and errors
- auto-scroll on new messages
- disable composer while sending if needed

Backend tasks:
- persist chats and messages
- associate chats with authenticated user
- return conversation history and assistant responses

## Phase 6 — Add conversation history and sidebar
- list chats in a sidebar
- create new chat
- load existing chats
- select chat and load messages
- maintain ordering by recent activity
- show title and last message preview

## Phase 7 — Add streaming
Recommended approach: SSE first.

Why SSE:
- simpler than WebSocket for token streaming
- fits chatbot output well
- easier to secure and reason about in FastAPI

Tasks:
- backend streaming endpoint
- incremental rendering in React
- streaming/loading/error states
- persist final assistant message after completion

## Phase 8 — Add advanced features selectively
Only port these if ASM2 really needs them:
- attachments
- structured action buttons or offers
- real-time notifications
- richer event-driven workflows

Do not import mecopia complexity by default.

## Phase 9 — Polish and validate
Polish:
- align chat UI with existing ASM2 design system
- support dark mode
- ensure responsive behavior
- refine empty, loading, and error states

Validation:
- frontend component and integration tests
- backend auth and chat endpoint tests
- manual validation of login, chat creation, send, reload, and history

## Recommended implementation order
1. Lock architecture decision
2. Audit mecopia UI and interactions
3. Define backend API contract
4. Add `/chat` route and static shell
5. Implement send/receive flow without streaming
6. Add persistence and conversation history
7. Add sidebar and chat list
8. Polish UX and responsiveness
9. Add SSE streaming
10. Revisit optional advanced features

## MVP definition
A successful MVP includes:
- authenticated chat route in `dashboard-ts-router`
- same Logto login/session as dashboard
- create/select conversation
- send message and receive answer
- persisted chat history
- responsive layout
- polished basic chat UI

Excluded from MVP:
- attachments
- offers/dialog workflows
- socket-based architecture
- desktop/Electron-specific features

## Main risks
- current backend contract is too limited for a full chat product
- over-porting mecopia features can slow delivery
- streaming can expand scope if attempted too early
- introducing a second frontend stack would increase maintenance cost

