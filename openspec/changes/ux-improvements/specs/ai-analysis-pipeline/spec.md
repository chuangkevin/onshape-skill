## MODIFIED Requirements

### Requirement: Parallel Gemini analysis
The system SHALL execute Gemini analysis subtasks in parallel and report results via Server-Sent Events (SSE). Each subtask SHALL independently stream its status and results back to the client as it completes, rather than waiting for all subtasks to finish before responding.

#### Scenario: SSE streaming of subtask results
- **WHEN** the user triggers an AI analysis that involves multiple Gemini subtasks
- **THEN** the server SHALL open an SSE connection and emit an event for each subtask as it starts, progresses, and completes

#### Scenario: Independent subtask completion
- **WHEN** one subtask completes while others are still running
- **THEN** the server SHALL immediately emit an SSE event with that subtask's result without waiting for the remaining subtasks

#### Scenario: Subtask failure isolation
- **WHEN** one subtask fails during parallel execution
- **THEN** the server SHALL emit an error event for that specific subtask and continue processing the remaining subtasks without aborting the entire analysis

---

### Requirement: Analysis results storage
The system SHALL persist each subtask's results incrementally as they complete (邊跑邊存), rather than waiting for all subtasks to finish before writing to storage. Each subtask result SHALL be individually queryable immediately after it is stored.

#### Scenario: Incremental storage on completion
- **WHEN** a single Gemini subtask completes successfully
- **THEN** the system SHALL immediately persist its result to storage without waiting for other subtasks

#### Scenario: Partial results availability
- **WHEN** some subtasks have completed and others are still running
- **THEN** the already-stored results SHALL be available for retrieval via the API

#### Scenario: Storage failure handling
- **WHEN** persisting a subtask result fails
- **THEN** the system SHALL retry once, and if the retry fails, log the error and emit an SSE error event for that subtask while continuing to process and store other subtask results

---

## ADDED Requirements

### Requirement: 分析進度 UI (Analysis progress UI)
The frontend SHALL use `EventSource` to connect to the SSE endpoint and display real-time status for each analysis subtask. Each subtask SHALL be displayed as an individual progress item with its current state.

#### Scenario: Real-time subtask status display
- **WHEN** the user initiates an AI analysis
- **THEN** the frontend SHALL open an `EventSource` connection and render a progress panel showing each subtask with its status (pending / running / completed / failed)

#### Scenario: Live status transitions
- **WHEN** the server emits an SSE event indicating a subtask status change
- **THEN** the frontend SHALL update that subtask's display in real time without requiring a page refresh or manual polling

#### Scenario: All subtasks completed
- **WHEN** all subtasks have reported a terminal status (completed or failed)
- **THEN** the frontend SHALL close the `EventSource` connection and display a summary showing the overall analysis result

#### Scenario: Connection interruption
- **WHEN** the SSE connection drops unexpectedly
- **THEN** the frontend SHALL automatically attempt to reconnect and request any missed events, displaying a temporary "Reconnecting..." indicator to the user
