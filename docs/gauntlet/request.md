# Weng's request (verbatim, from APP All Root chat, Nov 17 2026)

## t8u (9:49 AM PT)
Look at app/motivation/accountability and clone that into app/healthcare/appts. We will also move postop to app/healthcare/postop.

Then create an index.php page at app/healthcare/ that has the same design philosophy as app/adhd, app/motivation trainer/, etc. There's a hero, there's etc etc

Then then: Make a new bot into the section Draining

The purpose of it is to track all my visits to different doctors. Instead of each person, it's each condition/dz. And inside it you can have different dr / specialist, their name VS authorization letters VS etc etc. Make pasting pictures possible. Use index.php no composer vendors and no router.

You may want to create epics and milestones first, then graph prompt md files with loop prompt md files, gauntlet approach with quality bars to meet, and auto verification.

Once you've made the documents for epics, milestones, graph prompt, loop prompt, etc - then execute the graph prompts to implement everything. 

Do not stop at batches of work. Do not stop to ask me for any decision. Make the decisions for me. Drain the tokens all the way

## t9u (9:50 AM PT)
another type besides vs and authorization letters is appealing/coordinating with insurance, and another may be to get medical supplies and another may be care (wound care etc), another may be treatment (radiation etc)

## t11u (9:51 AM PT)
And perhaps make those entry types extensible. There could be a page where user can edit in additional types and modify the current types.

## t12u (9:52 AM PT)
Keep the data persistent file storage based. Make sure there's a demo account that user can click to quickly fill. But make sure there's a wf account too, same password

## t13u (9:52 AM PT)
Make sure not to stop to ask me decisions, just go all the way

## t14u (9:53 AM PT)
We should do all this work at APP Appts bot

## t4u-appts (10:00 AM PT, APP Appts chat)
Add to your plans that user can filter the timeline by entry type (the entry types will render based on the entry types that exist in the timeline). Also allow filtering the timeline by tags. User can add one or more tags creating the tags on the fly too

## t5u-appts (10:03 AM PT, APP Appts chat)
Add these base entry types too: Clinical event (eg. wounds worse), Insurance event (denied), Logistics event (please come up with a better name - eg. surgery machine broken)

## t6u-appts (10:04 AM PT, APP Appts chat)
You can add icons for these base entry types. The custom entry types can also accept icons otherwise it's a placeholder icons. Entry types can be assigned colors too

## t7u-appts (10:07 AM PT, APP Appts chat)
And make sure user can add rich text format notes, much like the accountability app that our current app originally cloned some code from

## t8u-appts (10:09 AM PT, APP Appts chat)
user can add rich text format note per entry

## t9u-appts (10:11 AM PT, APP Appts chat)
a clinic visit to dr/specialist/etc can also be to lab work.

User should be able to easily upload PDF/images of their consultation notes or lab work. App should have an area where you can see all uploads by filetype (PDF etc) and the type user selected for their upload (Lab, Consultation Note, PCP Note, Progress Note, etc - any custom labels they add are saved to be useable too)

## t11u-appts (6:50 PM PT, APP Appts chat)
For all Status, lets add a Free Text option. Lets rename Care disruption to Other care disruption.

## t12u-appts (6:58 PM PT, APP Appts chat)
THEN: Brand somewhere (rewrite to sound easier to read) I guess README and in the app: You or a loved one's appointments and insurance shenanigans are getting out of hand? Some diseases require multiple visits and coordination, also imaging and insurance issues to navigate. Here is an appointment/insurance/progress tracker for each condition

## t13u-appts (6:59 PM PT, APP Appts chat)
And I guess also at the healthcare index

## t14u-appts (7:03 PM PT, APP Appts chat)
We can also add Home Health nurses visiting you into something that we track. Often they stop visiting because of insurance needing to approve the next 5-7 visits. And sometimes they can't come because they dont have time availability, and sometimes they cant come because you have to go to a clinic. Have a way to track this, including the authorized visits counting down. And an event can be waiting for further approval. another can be spoken to case manager at home health. Update sample data

## t15u-appts (7:04 PM PT, APP Appts chat)
THEN: Create a skill at local codebase at .agents/skills/* where user can upload images, pdf's, etc free flow explaining their appointments, insurance, clinical disruptions etc, and their account and condition is updated. Ask user to clarify which user and what condition. No need to ask for password since this is asking codebase directly

## t17-appts (7:35 PM PT; Weng's t17u in APP All Root's chat, relayed via APP All Root)
Relayed request (APP All Root's summary of Weng's words): give Appts the same offline / cache / PWA status feature just built into Postop.
- A primary "Offline mode" toggle. Turning it on caches everything, then answers every request from the cache, including the front page URL.
- A status panel showing on/off, last saved time, item count, and size.
- An (i) info button that opens a short explainer illustrated with a doctor at a clinic that doesn't share internet: turn this on first, while you're still online.
Reference implementation: app/healthcare/postop (docs/OFFLINE_MODE.md, "Reusing this in another PHP app"; commits 1630fa4..2caa3de). Appts stores its data as files on the server, so plan the offline copy of each account's JSON and uploads to match. Weng wants no stopping to ask him decisions.

## t18u-appts (Nov 17 evening PT; Weng's t18u, queued after APP All Root's header follow-ups)
THEN Implement these two features: 1. Add disruption filter that's built in. It shows all insurance denials etc and other disruptions. User can edit the filter adding in events (grayed out until they ungray it) by going into Edit Disruption mode, only available for this filtering 2. Users can associate with PDFs and other events and their notes already created by pressing @ that shows a popover context menu of libraries, moving mouse over a Documents library shows you documents you can tag - but as user types after @ then it filters the choices at the context menu Make commits and push up
