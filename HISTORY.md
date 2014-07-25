# Release history

## v0.1.16

### Not loaded and calls
When using flash, soundManager2 has not been loaded, therefore the sounds are still in the queue.
So now a warning is outputted for this case and for any error the callback `onfinish` is called.


## v0.1.15

### No need for big alarm
Transforming console errors to warnings


## v0.1.14

### Down the loophole
When playing a sound with the infinite loop, the delete method was not called when trying to stop it. So it would keep
playing with a volume of 0.


## v0.1.13

### Letting you run doesn't sound fair
When trying quickly to execute multiple volume transitions, we stop the previous transition and execute the last one.
The only exception is when a sound is starting and we try to start it again, then we keep the first transition going.