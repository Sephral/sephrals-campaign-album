# Sephral’s Campaign Album: Manual

## The album

Open the album from the token controls on the left (images icon), with the button above the journal directory, or with the button of a photo's chat message.

* **Sessions:** the album shows the current session. The selection on top switches to another session or to all of them.
* **Large view:** click a photo. The arrows or the arrow keys go to the previous and next photo, Escape closes the view.
* **Slideshow:** shows every photo of the campaign, five seconds each, until you stop it.
* **Camera:** the camera button in the token controls or in the album takes a photo.
* **Open as journal:** the album is a normal journal with one page per session, readable without the module.

## For the GM

* **Photos of your own:** the camera button photographs the selected tokens, or your current view if no token is selected. Another GM's camera button asks the active GM, who takes the photo.
* **Captions:** in the large view, the pen changes the caption, the bin takes the photo out of the album.
* **New session:** a session ends on its own after some hours without photos (setting). The button *New session* lets the next photo start a new page right away.
* **Photos by players:** depending on the setting, a player's photo appears as a chat message only you see, with *Add* and *Decline*, or goes straight into the album.

## Last time (recap)

The recap shows the photos of one session to everyone, one after another, behind an intro slide with the session title, date and number of photos.

* **Offer:** when a new session starts, the GM gets a whispered chat card *Last time: 5 photos in Session 2. Show the recap?* with the button *Show the recap* and a short notice. It appears when the new session page is created (the first photo after the gap) or when you press *New session*, once per session. Nothing opens by itself.
* **Any session:** in the album window, the button *Recap for everyone* (GM) starts the recap of the session selected on top, or of the latest one when *All sessions* is selected. From a script: `game.modules.get("sephrals-campaign-album").api.recap(pageId)`.
* **The GM leads:** the recap opens as a window on every connected screen. It advances every six seconds. The GM pauses, steps back and forth and ends it for everyone with *End for everyone*. Closing the window does the same. Players only watch and can close the window for themselves, it does not open again for them.
* **Late joiners:** a player who logs in while a recap runs gets the window right away. A player who closed it finds the button *Watch the recap* in the album.
* **What is shown:** only photos that are in the album, which means approved ones, and only of session pages the players may read. A session page whose permissions hide it from players cannot be shown to everyone, the GM is told so. Each screen shows only what its user may read.
* The running recap is kept in the hidden world setting `recap` (session page, current slide). A recap left behind for more than three hours is ended at the next start.

## Whose eyes

Every photo is taken on one client, so it shows what that user saw, with lighting, vision, walls and fog of war:

1. A player who owns a character in the picture and looks at that scene.
2. Otherwise another player who looks at that scene.
3. Otherwise the active GM, if the GM looks at that scene. Photos from the GM's view leave out hidden tokens, hidden tiles and drawings and the map notes.

The view of that client moves for a fraction of a second if the moment is not on its screen and moves back before anything is shown, so nobody notices. The grid, selection frames, target markers, rulers, other users' cursors and wall or light handles never appear in a photo. With the setting *Always the GM's view* every photo is taken on the GM's client.

## Moments per game system

| Moment | Crucible | D&D 5e | Pathfinder 2e | Other systems |
| --- | --- | --- | --- | --- |
| Critical hit | Critical success of an action | Critical attack roll | Critical success (degree of success) of a strike or spell attack, also of a skill check, save or Perception check when *Checks and saves too* is on | A natural 20 on a d20 |
| Fumble (off by default) | Critical failure of an action | Fumbled attack roll | Critical failure of the same rolls | A natural 1 on a d20 |
| A boss falls | Adversary of the boss rank defeated or dead | Creature with legendary actions or resistances defeated or dead | An NPC two or more levels above the party, defeated or dead (an elite creature counts with its raised level) | not recognized |
| Victory | The last hostile combatant of a fight falls | same | same, hazards and loot do not count as enemies | same |
| Hero down | not recognized | not recognized | A player character gains the dying condition | not recognized |
| Farewell | A hero with a player dies | A player character dies (dead status or three failed death saves) | A player character dies (dead status or dying at its maximum value, which doomed lowers) | The dead status on a character with a player |
| Level up | A hero's level rises | A character's level rises | A character's level rises | not recognized |
| Sunrise | The sun rises in Ember's calendar | The sun rises in the calendar of D&D 5e 6 or Ember | When the world calendar knows a sunrise | When the world calendar knows a sunrise |

Critical hits count for the player characters unless the setting says everyone. A boss photo replaces the victory photo of the same fight. A defeated mark and the dead status of the same creature give one photo. The sunrise photo shows the heroes on the current scene (or the GM's view when none are there), once per change of the world time even after a jump over several days, and not during a fight.

In D&D 5e the album also reads the quick roll cards of Ready Set Roll: the attack on the card decides, its damage does not, and each card gets at most one photo.

### Pathfinder 2e

* The album reads the degree of success that Pathfinder 2e stores on each check. Damage rolls, flat checks and initiative never make a photo, and neither do secret or blind rolls of the GM.
* A critical success of a skill check, a save or a Perception check gets its own caption (*pulls off a critical success*), because nothing was hit. Only with the setting *Checks and saves too* (off by default), strikes and spell attacks always count. These photos share the limit of automatic photos per session with boss and farewell photos, so leave it off unless the table wants them.
* The party level for the boss rule is the average level of the player characters in the current fight, or, when no fight has any, of the player characters on the current scene, else of all player characters of the world. Level 3 and up against a level 1 party makes a boss, a level 2 elite creature counts as level 3.
* *Heroes going down* takes one photo when a player character starts dying. A hero who is at the dying maximum at once (for example with doomed) only gets the farewell photo. Standing up and falling again gives a new photo. The photo counts toward the limit of automatic photos per session; switch *Heroes going down* off if your group goes down often.
* The farewell photo does not wait for the dead mark: Pathfinder 2e only sets it by hand, so the album treats a character at the maximum dying value as dead.

## Session as a picture

Each session in the album window has three small buttons next to its title, and the last slide of the recap shows them too. They turn the session into one picture, 1080 pixels wide and drawn at double resolution: the title of the world, the session number and date, up to nine photos in a grid with their captions and a badge for the kind of moment (critical hit, fallen boss and so on). A session with more than nine photos shows the big moments first and a line *+n more in the album*.

* **Copy as image:** puts a PNG on the clipboard. Browsers allow this only on secure pages (https or localhost). On plain http, or when the browser refuses, the picture is saved as a file instead and a notice says why.
* **Save as image:** downloads the picture. The client setting *File format of the session picture* chooses WebP (default) or PNG.
* **Post as image:** uploads the picture to `worlds/<world>/sephrals-campaign-album/share/` (on The Forge to the Assets Library) and posts it in the chat for everyone. It needs the permission to upload files, so players usually do not see the button, and a session page that all players may read, because the picture shows its photos to everybody.
* **Rights:** a user gets only photos of session pages the user may read (observer rights). Photos a player sent that the GM has not approved are not in the album and so not in any picture.
* **Photos that cannot be loaded** (a missing file, an image server without CORS) leave a placeholder in the picture, a notice says how many.
* **Name on the picture:** the world setting *Name on the session picture* (on by default) adds the line *Made with Sephral’s Campaign Album* at the bottom. Switch it off for a picture without it.

## Combat totals

With [Sephral’s Combat Log & Stats](https://foundryvtt.com/packages/sephrals-combat-log-stats) active, every session page ends with the battles of that game night: fights and rounds, the damage and healing of the heroes, defeated foes, how often a hero went down, critical hits and the hero of the night. The numbers come from Combat Log & Stats and hold only what players may see there, with the sharing choices of each fight. While player reports are off in Combat Log & Stats, no new totals reach the pages.

* A page counts the game nights of Combat Log & Stats that overlap the time of its photos, or the nearest one a few hours before or after.
* The totals follow the fights: they update with every new photo and when a fight ends or is changed later. Each start of the world brings every page up to date, so pages from before get their totals then too.
* Updating the totals changes only their part of the page, so notes you wrote into an older page stay.
* A page keeps its totals when Combat Log & Stats no longer finds the fights of that night, for example after player reports were turned off or old logs were removed, just like a report already posted.
* The setting *Combat totals on session pages* hides them on every page and shows them again.
* Without Combat Log & Stats, or with an older version of it, the album works as before. The GM then sees a small hint with a link at the bottom of the album window. Turning the setting off hides the hint too.

## Settings

All options are in *Game Settings → Configure Settings → Sephral’s Campaign Album*:

| Setting | What it does |
| --- | --- |
| Module language | Follow Foundry, German or English, for you |
| Automatic photos | Switches all automatic photos on or off |
| Critical hits, Fumbles, Fallen bosses, Victories, Heroes going down, Farewells, Level ups, Sunrise | The moments the album captures on its own. *Heroes going down* only exists in Pathfinder 2e |
| Checks and saves too | Pathfinder 2e: critical successes and failures of skill checks, saves and Perception count like strikes, off by default because they are common |
| Whose critical hits | Player characters or everyone in the fight |
| Automatic photos per session | Limit, 0 means no limit. Photos you take yourself do not count |
| Pause between automatic photos | Seconds before the next automatic photo |
| Through whose eyes | Through the players' eyes, or always the GM's view |
| Photos by players | Off, the GM decides, or straight into the album |
| Chat messages | A message with every new photo for everyone, only for the GM, or none |
| New session after | Hours without a photo after which the next photo starts a new session |
| Name on the session picture | The credit line on the session picture, on by default |
| File format of the session picture | WebP or PNG for saving and posting, for you |
| Combat totals on session pages | The fights of each game night from Sephral’s Combat Log & Stats on its page, on by default (see [Combat totals](#combat-totals)) |
| Self test | Checks the album, the image folder and taking photos (GM) |
| Debug file | Saves a file for bug reports (GM), see below |

## Debug file

When an automatic photo is missing or comes at the wrong moment, a debug file shows what the album saw. It is one file for all of Sephral’s modules in the world, and the GM saves it in two places:

* *Save debug file* in the module settings: the latest 20 messages with rolls and every recent decision of the automatic photos.
* *Save Debug File (Sephral’s Modules)* in the context menu of a chat message: that one message.

The file holds the Foundry, system and module versions, the active modules, the settings of the modules, the chat messages with their rolls, for each message the crit or fumble the album found and the check that stopped the photo (no actor, not a player character, no token, moment switched off and so on), the result of each automatic photo since the last reload (limit, pause or a missing view) and the state of the album: journal, number of photos, the current session and whether the limit or the pause applies right now.

The file contains chat text and whispers. Check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video and an *Install* button. Foundry installs modules only on its setup screen, so the button copies the module's link (manifest URL) and shows the steps with a short clip. When the GM launches the world again, the window opens once with the new module and its *Enable* button. The list is part of the module. Only a video you start is loaded, from the module page on GitHub. If the GM agreed to the usage statistics, the window also counts how it is used: opened, the other modules shown, a video or install link of one of them, a module installed or switched on from it. It never records which module.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For the Campaign Album it holds:

* on how many of the last 30 days the module was used
* how often photos are taken automatically or by hand, players send in photos, the slideshow runs, session pictures are copied, saved and posted, a new session page starts, the recap is offered and shown, captions are edited and photos are removed
* the settings *Automatic photos*, *Through whose eyes* and *Photos by players* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, chat messages, notes, dice results or other content of the world are sent.

## Storage

* The album is the journal *Campaign Album*. Everyone may read it, only the GM changes it. Each session page keeps its photos and the combat totals of its night in the page's flags and shows them in its text.
* The images are WebP files in `worlds/<world>/sephrals-campaign-album/session-<n>/`, on The Forge in `sephrals-campaign-album/<world>/` of the Assets Library. A photo is about 100 to 500 KB.
* Foundry cannot delete files from a browser. A photo taken out of the album keeps its file in the folder. A declined player photo never becomes a file.
* Photos are stored by the active GM, who needs the permission to upload files (by default Assistant GM and Gamemaster).

## API

`game.modules.get("sephrals-campaign-album").api` offers:

| Function | What it does |
| --- | --- |
| `open({photoId})` | Opens the album, optionally at a photo |
| `takePhoto({kind, tokens, scene, frame, caption, actors})` | Takes a photo (active GM). `kind` is `manual` or one of the moments, `tokens` are tokens or token documents, `frame` a scene rectangle when there are no tokens |
| `photos()` | All photos in order, with their session |
| `journal()` | The album journal |
| `system()` | The rules of the running game system |
| `runSelfTest()` | Runs the self test (GM) |
| `saveDebugFile(messageId)` | Saves a debug file about one chat message, or without an id about the latest roll messages (GM) |
| `samples()` | The sample windows, cards and questions with made-up photos, as a list of `{id, label, group, open()}`. Nothing is saved, so translators and testers see every text without a session |

## Limits

* A GM has to be online for photos.
* A moment on a scene nobody looks at cannot be photographed.
* The GM's view shows the whole scene without the players' vision. When no player looks at the scene, the photo may show more of the map than the players know, but never hidden tokens.
* Effects that other modules draw outside the canvas (HTML overlays, for example) are not in the photo.
