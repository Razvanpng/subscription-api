## What I built and what I skipped
I built all the required endpoints, plus the history one. I didn't implement the multi-tenant stuff because I wanted to keep the project simple and straight to the point.

For the grace period, I took a shortcut. Instead of setting up a background job that constantly checks for expired subscriptions, I just used lazy evaluation: the system only checks if a subscription has expired when someone actually tries to fetch it. It's a quick fix that gets the job done for a project this size.

## Spec gaps and how I handled them
Some parts of the requirements were left open, so I made the following calls:

* **How long is the grace period?** It wasn't specified, so I set it to 7 days, same as the trial.
* **What if a payment fails during the trial?** I move the subscription to "grace". It means a charge was attempted and failed, so it needs to go into recovery.
* **What if a payment succeeds AFTER the user cancelled?** I leave the status as "cancelled". If the user wanted out, we respect that. The payment just gets logged in the history.
* **What if a payment fails while already in grace?** I ignore it. If I reset the 7-day timer every time a payment fails, the subscription would never actually cancel.
* **Can a user have multiple subscriptions?** The spec didn't say no, so I left that option open.
* **Hitting cancel twice:** If you try to cancel a subscription that's already cancelled, the API throws a 409 Conflict error. It's better to tell the client "hey, this is already cancelled" instead of pretending it worked again.

## The Database
I went with SQLite. It's perfect here because you don't need to install or configure any database server to run the project—it just works out of the box. Obviously, if this were going into real production, I'd swap it out for Postgres.

## That weird race condition
*What happens if the user hits cancel the exact same second the payment success webhook comes in?*

I decided the state stays **cancelled**. 
1. The user hits cancel -> the status changes to "cancelled".
2. The payment confirmation arrives a bit later -> the system sees the sub is already cancelled, so it changes nothing. It just logs the event.
It would be super annoying UX to have a subscription automatically reactivate right after the user clicked stop.

## If I had more time...
* I'd write some tests to make sure the grace period expires exactly when it's supposed to.
* I'd actually build that background job to clean up expired subscriptions properly.
* I'd make the tests completely independent (right now they rely a bit on the order they run in).

## How I used AI
I used AI to help me think through the edge cases logically, especially how to make sure I don't process the same payment twice by accident. It helped me realize I shouldn't reset the grace timer if a payment fails again. It also suggested building the background checker, but I chose not to do it so I could keep the code simple for now.