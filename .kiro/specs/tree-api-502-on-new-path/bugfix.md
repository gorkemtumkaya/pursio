# Bugfix Requirements Document

## Introduction

When a learner types a hobby on the new hobby page and starts building a path, the browser sends `POST /api/tree` and the local dev server answers `502 Bad Gateway`. The learner sees a generic error and gets no skill tree. The route returns 502 for four different failures (`generation_failed`, `provider_auth`, `provider_error`, `save_failed`), and the server log records only the code, provider and model. Today there is no way to tell from the 502 which stage failed (AI provider call, tree validation, or saving the path to the account), so the cause cannot be found or fixed from the symptom alone. This fix makes the failing stage identifiable and removes the failure for a correctly configured setup.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a signed-in learner submits a valid hobby on the new hobby page with the default server configuration THEN the system answers `POST /api/tree` with 502 and no skill tree is created

1.2 WHEN `POST /api/tree` ends in a 502 THEN the system gives the learner and the developer no way to tell which stage failed (provider call, tree validation after the retry, or the path save), because the server log holds only the error code, provider and model and several stages share the 502 status

1.3 WHEN the path save fails after a tree was generated THEN the system reports a 502 and discards the generated tree for the learner, even though the tree is cached on the server

1.4 WHEN the AI provider rejects the server key or returns an error THEN the system reports a 502 and the learner is shown a generic message that does not say the setup needs attention

### Expected Behavior (Correct)

2.1 WHEN a signed-in learner submits a valid hobby on the new hobby page with a working server configuration THEN the system SHALL return 200 with the tree, the model and the saved path id, and the learner SHALL reach the ready state

2.2 WHEN `POST /api/tree` ends in an error status THEN the system SHALL log the failing stage (token check, prompt load, provider call, tree validation, or path save) together with a non-secret reason, without keys, tokens or response bodies, so the cause can be read from the dev server output

2.3 WHEN the path save fails after a tree was generated THEN the system SHALL CONTINUE TO report `save_failed` and SHALL make a retry of the same request return the cached tree and attempt only the save again

2.4 WHEN the provider rejects the server key or returns an error THEN the system SHALL return the matching error code and the learner SHALL see a message that tells them to try again later or to add their own key in Settings

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the Access_Token is missing or invalid THEN the system SHALL CONTINUE TO return 401 `unauthorized`

3.2 WHEN the hobby is empty, longer than the limit, or the level is not a valid starting level THEN the system SHALL CONTINUE TO return 400 `invalid_input`

3.3 WHEN the input is not a hobby THEN the system SHALL CONTINUE TO return 422 `not_a_hobby`

3.4 WHEN the default configuration has no provider, model or key and the request carries no user key THEN the system SHALL CONTINUE TO return 503 `no_key`

3.5 WHEN a user exceeds the hourly limit on the default configuration THEN the system SHALL CONTINUE TO return 429 `rate_limited`, and cache hits SHALL CONTINUE TO not count toward the limit

3.6 WHEN generation exceeds the server time limit THEN the system SHALL CONTINUE TO return 504 `timeout`

3.7 WHEN the provider answer is unusable or fails validation THEN the system SHALL CONTINUE TO retry once and then return `generation_failed`

3.8 WHEN a request carries the user's own API key THEN the system SHALL CONTINUE TO use the provider and model from the request body and SHALL CONTINUE TO not count it toward the hourly limit

3.9 WHEN a tree is generated and saved THEN the system SHALL CONTINUE TO save it through `save_generated_path` with the learner's own token and return the same response shape
