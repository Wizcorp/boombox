# Release history

## v0.1.13

### Letting you run doesn't sound fair
When trying quickly to execute multiple volume transitions, we stop the previous transition and execute the last one.
The only exception is when a sound is starting and we try to start it again, then we keep the first transition going.