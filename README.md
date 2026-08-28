# Non-Automation Requirement

This project is intended exclusively for interactive, user-directed quality-of-life enhancement and information presentation within HoboWars 1.

Use, modification, adaptation, or redistribution of this project for macroing, botting, unattended gameplay, automated combat, automated navigation, automated resource acquisition, automated transaction execution, or any system that performs game actions without contemporaneous user initiation is expressly prohibited.

This restriction is fundamental to the project and applies to derivative works and modified distributions.

## Module Controls

HW Utility Suite currently supports only **The Future** Layout. 

HW Utility Suite installs a centralized control panel into the native HoboWars **Preferences** page. Each module can be independently enabled or disabled from this panel, with changes taking effect on the next page load.

### Module Index

1. [UFC Penalty Info Toggle](#1-ufc-penalty-info-toggle)
2. [Feed the Seal](#2-feed-the-seal)
3. [Collapsible Thread Replies](#3-collapsible-thread-replies)
4. [Player Stats Tracker](#4-player-stats-tracker)
5. [Super-Cart Racing](#5-super-cart-racing)
6. [Wellness Aid](#6-wellness-aid)
7. [Equipment Redux](#7-equipment-redux)
8. [Personal Hitlist Keybinds](#8-personal-hitlist-keybinds)
9. [Awake & BAC Bar Painter](#9-awake--bac-bar-painter)
10. [Dynamic Game Clock](#10-dynamic-game-clock)
11. [Recycling Bin Quick-Add](#11-recycling-bin-quick-add)
12. [Fight Skill Recap](#12-fight-skill-recap)
13. [Fight Record Tracker](#13-fight-record-tracker)
14. [Topbar Swim Times](#14-topbar-swim-times)

### 1. UFC Penalty Info Toggle

Adds a second function to the native UFC Penalty Info toggle, allowing players to hide the information again after displaying it.

### 2. Feed the Seal

A fully self-contained inline SVG elephant seal pup appears to devour any Message Board reply the user is permitted to delete and elects to remove, before ultimately disappearing. The animation is accomplished entirely through inline CSS classes and styling; no external resources are required.

### 3. Collapsible Thread Replies

The separator bar beneath each Message Board thread reply is converted into a toggle button that shows or hides the reply immediately above it. Hidden replies are stored by their individual reply IDs for persistence across page loads. Restoring a previously hidden reply removes that stored collapsed state.

### 4. Player Stats Tracker

Adds a compact history panel to player profiles that records changes to Respect, Level, Money, Life, and Fight Record over time. Only changed values are logged after the initial snapshot, allowing the panel to function as a lightweight profile-history ledger.

### 5. Super-Cart Racing

Adds a compact race-history panel to the Pikie interface, grouping Racing Skill gains by date and opponent while maintaining per-group and overall totals. The panel observes and records completed race results as they are displayed and remains independently clearable from the page. Also adds a Hall of Fame racer skill table with variable sorting that updates as the player manually traverses the Hall of Fame according to the contents of each page. In addition, replaces the link to view the currently signed up racers in your class with a state-aware button that opens a small table on the same page or closes it that gives the same information. Hiding and then clicking View again will refresh the table.

### 6. Wellness Aid

Adds visit-cost planning and daily expense tracking to the Wellness Clinic. The module projects upcoming treatment costs, can stage a selected amount for quick addition at the Bank, and maintains a compact daily log of visits and money spent.

### 7. Equipment Redux

Rebuilds the Equipment page into a compact card-based interface with collapsible categories, imagery controls, and persistent Favorites. Native equipment actions remain intact while the presentation is reorganized for faster browsing and comparison.

### 8. Personal Hitlist Keybinds

Adds configurable two-key shortcuts to the Personal Hitlist. The chord does not initiate an attack independently; it activates the native **Fight!** link already present for that Hobo while the page is open. Bindings are assigned individually, stored persistently, and can be cleared either per Hobo or in full.

### 9. Awake & BAC Bar Painter

Keeps the native Awake and BAC displays visually current between page loads by projecting scheduled regeneration against Hobo Server Time. Donator status is taken into account, and forfeited Awake caused by regeneration occurring at the cap is tracked separately.

### 10. Dynamic Game Clock

Keeps the native HoboWars clock ticking accurately while the page remains open, including during tab throttling or periods of inactivity. The server-provided clock remains the authoritative starting point; local time is used only to measure elapsed time.

### 11. Recycling Bin Quick-Add

Adds configurable quick-add buttons beside the Recycling Bin input and displays the projected cash and Recycling Point yield for the entered quantity. Button amounts are user-defined and persist between visits.

### 12. Fight Skill Recap

Adds a compact skill-use summary to completed fights, listing skills in the order they were used and separating them by participant. Cabana Club Card fizzles and Filthy Socks failures are identified directly in the recap rather than being counted as successful uses.

### 13. Fight Record Tracker

Tracks Wins, Losses, and Stalemates on a per-Hobo basis for completed fights. The module supports battle-log importing, duplicate protection, and reconciliation between overview entries and fully opened fight records so the same fight is not counted twice.

### 14. Topbar Swim Times

Places a small box in the topbar that provides the current day's- along with the two days to follow- upcoming Swim blocks. These times are known to occasionally deviate from the predicted schedule, although this occurs very infrequently. Any irregular Swim times that don't align with this display will be corrected at the earliest convenience.
