# User Manual — Ron Stage Master

**Application:** EilonRonStage (Ron Stage Master)  
**Reference version:** 1.5.0  
**Manufacturer:** Eilon Engineering  

---

## General index

- **Part I — Introduction**
  1. About this manual
  2. Overview
  3. Requirements
- **Part II — Navigation and basic concepts**
  4. Main menu and modules
  5. Concepts you should know
- **Part III — Project configuration**
  6. Create and select a project
  7. General project settings (More Settings)
  8. Settings — Load cells (LCs)
  9. Settings — Groups and group overload
- **Part IV — Monitor View**
  10. Accessing Monitor and initial checklist
  11. Screen components
  12. View mode — floor plan and layout
  13. List, Prog, and Stop modes
  14. Monitor plans
  15. Buttons and actions
  16. Alarms and warnings
- **Part V — PRR connection**
  17. Connect Device
  18. Operation with PRR connected
- **Part VI — Reports**
  19. Reports
- **Part VII — Troubleshooting and best practices** *(this document)*
  20. Common errors
  21. Recommended on-site sequence
  22. FAQ
- **Appendices** *(this document)*
  A. Capacities by cell ID
  B. Exported file structure
  C. Contact and support

---

# Part I — Introduction

## 1. About this manual

### 1.1 Purpose

This manual describes the operational use of **Ron Stage Master** (also identified on the device as **EilonRonStage**): a mobile application for **configuring, monitoring, and documenting** load cell (LC) weight in stage rigging and similar industrial applications.

The document follows the **recommended on-site workflow**: first configure the project and cells, then operate the Monitor screen, and when appropriate connect the wireless receiver (PRR) and export reports.

### 1.2 Who this manual is for

| Profile | Primary use of this manual |
|--------|------------------------------|
| **Field operator** | Live Monitor, weight readings, alarms, Zero and Tare during rigging |
| **Rigging / load monitoring technician** | Adding and editing cells, groups, overloads, monitor plans, and on-screen layout |
| **Supervisor / project lead** | Global project settings, historical reports, PDF/CSV export, and report header |

No programming knowledge is required. Basic familiarity with Eilon load cells, the PRR, and safe load concepts (WLL, overload, underload) is assumed.

### 1.3 What is and is not covered

**Included in this manual**

- Project creation and configuration
- Settings: cells, groups, and overloads
- Monitor screen (View, List, Prog, Stop)
- Bluetooth connection to the PRR
- Reports and exports
- Common errors and best practices

**Out of scope**

- Physical maintenance of load cells or the PRR
- Regulatory certification procedures (this manual describes the app; it does not replace local standards)
- Features not used in your deployment (e.g. hidden menu modules)

### 1.4 Conventions used in this document

| Symbol / format | Meaning |
|-------------------|-------------|
| **Bold text** | On-screen name (button, menu, field) |
| `Code / path` | Technical value, cell ID, or internal key |
| ⚠️ **Warning** | Irreversible action or safety risk (e.g. **Zero**) |
| ℹ️ **Note** | Useful information that does not block the workflow |
| Numbered steps | Sequence that must be followed in order |

**Examples of interface names (English by default)**

The application displays the interface primarily in English. Some elements cited in this manual:

- **Projects**, **Settings**, **Monitor**, **Reports**, **Connect Device**
- **More Settings**, **Total Overload**, **Pre-overload Warning**
- **Before You Start**, **TARE**, **ZERO**, **Tr.Err**

If the device language is set to Japanese or another supported language, equivalent texts will appear translated; the function is the same.

### 1.5 Versions

- **Manual version:** 1.0 — complete document  
- **Application version:** 1.5.0 (visible in the lower side menu: `version-1.5.0`)

If your installation shows another version, some screenshots or button names may differ slightly; the operational logic described remains valid unless release notes state otherwise.

---

## 2. Overview

### 2.1 What Ron Stage Master does

Ron Stage Master is the **load monitoring console** for work with Eilon load cells. The application:

1. **Organizes work by projects** — each rig or show can have its own cell configuration, groups, limits, and screen design.
2. **Receives real-time data** from the **PRR** (portable receiver) via **Bluetooth Low Energy (BLE)**.
3. **Displays weight** for each cell and each group, with battery indicators, overload/underload alarms, and transmission status.
4. **Records history** of readings (when the report cycle is active) for later review and export.
5. **Exports** monitor snapshots and reports in **CSV** and **PDF**, with a customizable header (logo, artist, city, website, QR code).

The app is designed for use **on site**, normally with the device in **landscape orientation**.

### 2.2 System components

```
┌─────────────────┐     radio      ┌──────────────┐     BLE      ┌─────────────────────┐
│  Load cells     │ ◄────────────► │     PRR      │ ◄──────────► │  Tablet / phone     │
│  (LC)           │                │  (receiver)  │              │  Ron Stage Master   │
└─────────────────┘                └──────────────┘              └─────────────────────┘
```

| Component | Description |
|------------|-------------|
| **Load cell (LC)** | Wireless sensor that measures load. Each LC has a **numeric ID** (e.g. 1000, 1500). The app assigns nominal capacity according to the ID range. |
| **PRR** | Receiver that aggregates cell signals and delivers them to the app over Bluetooth. Must be **powered on** and within radio/BLE range. The app allows connecting **up to 2 PRRs** simultaneously. |
| **Project** | Container for all configuration: units, total overload, cells, groups, monitor background image, monitor plans, and report data. |
| **Group** | Logical set of cells (e.g. "Front", "Rear"). Each group has its own **overload**; it is required to open Monitor. |
| **Mobile device** | iPhone, iPad, or Android tablet/smartphone with the app installed. Project data is stored **locally** on the device. |

### 2.3 Typical workflow

The order that reflects real on-site use is:

1. **Create or select a project**
2. **Configure general settings** (Total Overload, Pre-overload, report cycle)
3. **Add cells** in Settings and mark at least one in **Total Sum** mode
4. **Create groups** and define the **overload of each group**
5. **Open Monitor** and arrange cells in the layout (View mode)
6. **Connect the PRR** via Bluetooth
7. **Zero** the cells before applying load
8. **Monitor** weights and alarms; export snapshot or reports as needed

> ℹ️ **Note:** You can open Monitor and configure the layout **before** connecting the PRR. However, there will be no live readings until the PRR is connected and the cells transmit correctly.

### 2.4 Main application modules

| Module | Summary function |
|--------|------------------|
| **Projects** | Create, select, duplicate, delete, export, and import projects |
| **Settings** | Load cells, groups, overload per group |
| **Monitor** | Main live monitoring screen (View / List / Prog / Stop) |
| **Reports** | Historical query by date and CSV/PDF export |
| **Connect Device** | BLE scan and PRR connection |

The side menu also allows changing **language** (English / Japanese) and **light or dark theme**.

### 2.5 Data storage

- Project configuration and report history are saved in the device's **local storage** (internal app database).
- Project export (CSV) and report export allow **backing up** or transferring information to another device or PC.
- An Internet connection is not required for live monitoring or basic configuration.

---

## 3. Requirements

### 3.1 Supported platforms

Ron Stage Master is a **native** application for:

| Platform | Status |
|------------|--------|
| **iOS / iPadOS** | Supported (installation via App Store / TestFlight per your distribution channel) |
| **Android** | Supported (installation via Google Play or internal APK per your channel) |

The application is optimized for **landscape screen orientation**. On iOS the device is used horizontally; on Android the main activity is fixed in landscape.

> ℹ️ **Recommendation:** Use a **tablet** (iPad or Android) for Monitor View: the layout with background image and multiple cells requires horizontal space.

### 3.2 Required hardware

| Item | Requirement |
|----------|-----------|
| Mobile device | Integrated Bluetooth BLE; sufficient free space for the app and report data |
| Eilon PRR | Powered on, adequately charged, within range of cells and device |
| Load cells | Powered on; IDs configured in the app matching the physical devices |
| Charger / external battery | Recommended for long rigging sessions for tablet and PRR |

### 3.3 Bluetooth and permissions

Connection to the PRR uses **Bluetooth Low Energy**. Before the first scan, the operating system may request permissions.

**On iOS / iPadOS**

- **Bluetooth** permission — the app uses it to connect to the PRR and maintain communication during monitoring, including in the background.
- Enable **Bluetooth** in system Settings if the scan finds no devices.

**On Android**

- **Bluetooth** enabled.
- **Location services (GPS)** enabled — Android requires location for BLE scanning; the app checks this requirement before scanning.
- **Bluetooth Scan** and **Bluetooth Connect** permissions (depending on Android version).

If Bluetooth is off or, on Android, location is disabled, the app will show a warning and **will not start scanning** until corrected.

### 3.4 Working environment conditions

For reliable monitoring:

| Condition | Detail |
|-----------|---------|
| PRR powered on | Verify before connecting; the app shows link status in Monitor |
| Cells powered on | Without power there is no transmission to the PRR |
| No major obstacles | Interference or excessive distance can cause **Tr.Err** (transmission error) |
| Overloads configured | Total Overload, Pre-overload, and group overload must be defined before operating with alarms |
| Zero before loading | Applying load without Zero can invalidate the weight reference |

The **Before You Start** screen (when entering Monitor) summarizes several of these checks.

### 3.5 Configuration prerequisites (summary)

Before Monitor View is operational, the app requires at minimum:

1. An **active project**
2. **Total Overload** and **Pre-overload** not equal to zero in More Settings
3. At least **one cell** with **Total Sum** mode enabled
4. At least **one group** with **overload** defined (not empty and not zero)

If any of these are missing, when you try to open Monitor the application will show an error message indicating what must be corrected in Settings or the project.

### 3.6 Best practices before starting on site

1. **Create the project in advance** or duplicate a reference project if the rig is recurring.
2. **Verify cell IDs** against the physical labels on each LC.
3. **Define realistic overloads** per group and at project level, consistent with the rig WLL.
4. **Test the PRR connection** in an unloaded environment before rigging day.
5. **Check battery levels** of cells and PRR (visible in Monitor).
6. **Export the project** (CSV) as a backup before major changes.
7. Keep the device **charged** and Bluetooth enabled throughout the event.

---

# Part II — Navigation and basic concepts

## 4. Main menu and modules

### 4.1 How to open the menu

The side menu is the access point to all application modules.

1. Tap the **hamburger** icon (☰) in the upper-left corner of the toolbar.
2. The side panel opens with the Eilon logo, language selector, theme toggle, and module list.

> ℹ️ **Note:** The menu **does not** open by swiping from the screen edge; only via the ☰ button. This avoids confusion with other tablet gestures.

To close the menu, select a module (the menu closes automatically) or tap outside the panel.

### 4.2 Modules visible in the menu

The application shows **five entries** in the main menu:

| Menu entry | Behavior when tapped |
|-----------------|--------------------------|
| **Monitor** | Opens the live monitoring screen (full screen). Validates prerequisites; if configuration is missing, shows an error. |
| **Projects** | Opens a **dialog** (modal) with the project list. |
| **Settings** | Opens the **Settings** screen (full screen) for the active project. |
| **Reports** | Opens the **Reports** screen (full screen) for historical query. |
| **Connect Device** | Opens a **dialog** to scan and connect the PRR via Bluetooth. |

**Difference between screen and modal**

- **Full screen** (Monitor, Settings, Reports): occupies the entire interface; the top bar shows tools specific to each module.
- **Modal** (Projects, Connect Device): window overlaid on the current screen; closing it returns to what was visible before.

When the app starts, the default route is **Monitor**. If the project does not yet meet requirements, Monitor will show the corresponding message or offer to create a project.

### 4.3 Common top bar

On most screens, the top bar includes:

| Element | Location | Function |
|----------|-----------|---------|
| **Menu ☰** | Left | Opens the side menu |
| **Project name** | Center / right | Shows the active project (e.g. `My Show - Monitoring Screen`) |
| **Units: …** | Left (Monitor only) | Shows the active weight unit; tap to open the KG / LBS / M.TON selector |
| **Monitor icons** | Right (Monitor only) | View mode, MAX, TARE, LOAD, warnings, export snapshot — see Part IV |

In **Settings**, the bar includes quick access to **More Settings** (gear) and shows the project weight unit.

### 4.4 Language

At the top of the side menu there is a language selector:

| Option | Language |
|--------|--------|
| **English** | English (default) |
| **日本語** | Japanese |

The chosen language is saved on the device and persists when the app restarts.

> ℹ️ **Note:** Some technical module names (e.g. *Monitor*, *Settings*) may remain in English even with Japanese selected, depending on available translation.

### 4.5 Light / dark theme

Next to the language selector there is a **sun** or **moon** icon:

| Icon | Action |
|-------|--------|
| **Sun** ☀️ | Light theme active — tap to switch to dark |
| **Moon** 🌙 | Dark theme active — tap to switch to light |

The preference is saved automatically. If you have not chosen a theme before, the app adopts the operating system theme (light or dark per device).

The theme affects backgrounds, text, icons, and menu logo, but **does not** change alarm logic (overload and danger still display in red).

### 4.6 Application version

At the bottom of the side menu the installed version is shown, for example:

`version-1.5.0`

Use it when contacting technical support to identify your build.

### 4.7 Recommended menu usage order

For a new rig, the typical menu path is:

```
Projects  →  Settings  →  Monitor  →  Connect Device  →  Reports
 (create)     (LCs +        (layout +      (PRR BLE)         (history /
             groups)       monitoring)                       export)
```

You are not required to follow this order every time you open the app, but **Settings configuration must be complete before Monitor is fully operational**.

---

## 5. Concepts you should know

This section defines terms that appear on screen, in alarms, and in reports. Knowing them makes configuration (Part III) and Monitor use (Part IV) easier.

### 5.1 Project

A **project** is the container for all work of a rig or event:

- Name and measurement units
- Global limits (Total Overload, Pre-overload)
- Load cell list and their parameters
- Groups and overload per group
- Monitor design (image, positions, plans)
- Report data and export header

Only **one project is active** at a time. What you see in Settings and Monitor always corresponds to the project selected in **Projects**.

### 5.2 Load cell (LC)

Each **LC** (Load Cell) is a wireless sensor identified by a **numeric ID** (for example `1000`, `1500`, `2500`).

In the app, each LC has:

| Field | Meaning |
|-------|-------------|
| **Id** | Serial number / ID of the physical cell |
| **Name** | Descriptive name (optional) |
| **Capacity** | Nominal capacity according to ID (kg, lbs, or M.TON) |
| **Underload** | Lower alarm threshold (value in project units) |
| **Overload** | Upper alarm threshold for the individual cell |
| **P.S.W** | Preset starting weight — see glossary below |
| **Total** | If active (**Total Sum**), the cell contributes to the total weight shown in the Monitor header |

Nominal capacity is assigned automatically according to the ID range (see Appendix A).

### 5.3 Group

A **group** groups several cells under one logical name (e.g. `Front`, `Grid A`, `Motor Left`).

- Each LC can belong to one or more groups (**Group** field in Settings).
- Each group has its own **overload**: aggregated weight limit for the group.
- Group overload **cannot be 0 or empty** if you want to open Monitor.

**TARE** and **ZERO** group actions operate on all cells in the selected group.

### 5.4 PRR

The **PRR** is the Eilon portable receiver that:

1. Receives load cell signals by radio.
2. Forwards them to the app via **Bluetooth Low Energy (BLE)**.

In Monitor, PRR status is indicated by a Bluetooth link icon and, if connected, the **device name** and **battery percentage** of the PRR.

- You can connect **up to 2 PRRs** simultaneously.
- Without a connected PRR, cells show **Tr.Err** and there are no live readings.

Connection is managed from **Connect Device** (Part V).

### 5.5 Weight units

The project works in one of these weight units:

| App code | Name | Typical use |
|---------------|--------|------------|
| **KG** | Kilograms | Europe, general rigging |
| **LBS** | Pounds | USA, UK |
| **M.TON** | Metric ton | Very heavy loads |

The active unit is shown in the Monitor header as a text button, for example **Units: KG**.

**To change the unit:** in Monitor View, tap that text (**Units: KG**, **Units: LBS**, etc.). A dialog opens where you can choose **KG**, **LBS**, or **M.TON** and confirm with **Ok**.

> ℹ️ **Note:** Changing the unit affects the entire active project (readings, displayed overloads, and totals).

**Display resolution:** depending on cell capacity, weight is shown with a different number of decimals (e.g. integers in kg/lbs for many capacities, three decimals in M.TON).

### 5.6 Glossary of operational terms

#### Gross

Weight **shown on screen** after applying the cell **Zero**, but **before** subtracting group tare when NET mode is active.

This is the usual value for checking overload and danger in safety alarms.

#### Net

Weight with **group tare** deducted. Displayed only when:

1. The cell is in group tare mode (`status_tare` active), **and**
2. The **TARE** toggle in the Monitor top bar is enabled.

Cells in tare can be marked visually as **NET** on the cell icon.

#### Tare

Operation that **subtracts the current group weight** to measure only the load increment (net weight).

- Applied per **group** from group actions or the toolbar.
- **Cancel Tare** reverts the group tare.
- Tare on one group **does not affect** cells in other groups that remain in tare.

> ℹ️ **Note:** The **TARE** button in the top bar does not execute tare; it **toggles display** between Gross and Net for cells already in tare mode.

#### Zero

Operation that **redefines the zero point** of the cell or group. It is **irreversible** and requires **double confirmation** on screen.

Main effects:

- Adjusts the weight reference of the cell(s).
- Resets the cell **P.S.W** to zero.

⚠️ **Warning:** The app **blocks Zero** if gross load on the sensor exceeds **30% of the cell's nominal capacity**. You must unload before Zero.

Always perform Zero **before applying working load**, with cells unloaded and transmitting correctly (no Tr.Err).

#### P.S.W (Preset starting weight)

**P.S.W** (*Preset Starting Weight*) is a **numeric offset** configured per cell in Settings. It is added to the displayed weight to compensate for fixed rigging weight or other adjustments.

- Edited in each LC record in Settings.
- Cannot be negative.
- When you confirm **Zero**, that cell's P.S.W returns to **0**.

#### Tr.Err (transmission error)

**Tr.Err** (*Transmission Error*) indicates that the app **does not receive a valid reading** from that cell.

Common causes:

- PRR disconnected or out of range
- Cell powered off or out of PRR range
- Interference or momentary signal loss

While Tr.Err is shown, **do not** make load decisions based on that reading. Overload alarms are not evaluated on Tr.Err.

#### Overload

Alarm state when weight **exceeds the configured upper limit**:

| Level | Condition (simplified) |
|-------|--------------------------|
| **Overload** (cell or group) | Weight > configured overload |
| **TOTAL OVERLOAD** | Total sum > project Total Overload |
| **PRE OVERLOAD** | Weight > pre-warning threshold (see § 5.7) |

The cell/group icon or background changes color and an on-screen warning appears with sound.

#### Danger

**Severe** alarm state when weight reaches or exceeds **130% of the configured overload** (factor × 1.3).

Shown as **DANGER** in warnings. Indicates critical overload; act immediately per your safety procedure.

#### Underload

Alarm state when weight **falls below the lower threshold** (*underload*) defined for the cell.

The default when creating cells is **-10** (in project units). Can be edited per cell in Settings. Must be **less than or equal to** the cell overload.

#### Total Sum

Cell mode (**Total** in Settings) indicating that LC **contributes to the total weight** shown in the Monitor header (**Total Weight**).

**Requirement:** at least **one cell** in the project must have Total Sum enabled to open Monitor.

Not all cells in the rig need Total Sum — only those that should add to the global total.

### 5.7 Project-level limits

In addition to per-cell and per-group limits, there are two global parameters in **More Settings**:

| Parameter | Function |
|-----------|---------|
| **Total Overload** | Weight limit for the **total sum** of cells in Total Sum. Required (cannot be 0). |
| **Pre-overload Warning** | Percentage (1–99) that defines an **early warning** before reaching overload. Example: with overload 1000 and pre-overload 80%, the warning appears above 800. Required (cannot be 0). |

### 5.8 Monitor display modes (summary)

When you tap the mode icon in the Monitor bar, the screen cycles through:

| Mode | Brief description |
|------|-------------------|
| **View** | Floor plan with background image and positioned cells |
| **List** | Table with all readings |
| **Prog** | Progress bars relative to overload |
| **Stop** | Stop / summary view |

The cycle is: View → List → Prog → Stop → View…

Detailed description of each mode is in Part IV.

### 5.9 LOAD and MAX toggles (Monitor header)

| Toggle | Function |
|-------------|---------|
| **LOAD** | Toggles cell icons between **weight** and **battery** |
| **MAX** | Shows the **maximum value** recorded in the session instead of instantaneous weight (automatically enables LOAD) |

### 5.10 Visual summary of relationships

```
Project
 ├── More Settings (Total Overload, Pre-overload, reports)
 ├── Weight units (quick change from Monitor → Units: …)
 ├── Cells (LC) ── belong to ──► Groups (each with overload)
 ├── Monitor Plans (layouts and images per plan)
 └── Reports (history)

PRR (BLE) ── transmits ──► Cells (radio) ──► Readings in Monitor
```

---

# Part III — Project configuration

> **Recommended order:** create or select the project → configure **More Settings** → add **cells** → define **overload for each group** → open **Monitor**.

---

## 6. Create and select a project

### 6.1 Open the project list

1. Tap menu **☰** and select **Projects**.
2. The **Project List** dialog opens with existing projects.

At the top there is a **Search** field to filter by name.

### 6.2 Select an active project

- Tap the project **name** in the list.
- The project becomes active and the dialog closes.
- The app loads that project's configuration (cells, groups, settings).

Everything you see afterward in **Settings** and **Monitor** corresponds to the active project.

### 6.3 Create a new project

1. In **Project List**, tap **Create New Project**.
2. In the dialog that appears, enter the **project name** (*Enter Project Name*).
3. Tap **Ok**.

**App behavior**

- If you leave the name empty, **Untitled** is used.
- **Duplicate names** are not allowed; if the name already exists, you will see an error and must choose another.
- After creating the project, the app automatically opens **More Settings** so you can define initial parameters (see chapter 7).
- When you save More Settings, the app takes you to the **Settings** screen to continue with cells.

**Default values for a new project**

| Parameter | Initial value |
|-----------|---------------|
| Weight units | KG |
| Total Overload | 500 (in kg; adjusts if unit changes) |
| Pre-overload Warning | 100% |
| Reports Cycle | Disabled |
| Report interval | 60 seconds |

### 6.4 Duplicate a project

Useful to reuse configuration from a previous rig.

1. Open **Settings** for the project you want to copy.
2. In the top bar, tap **Duplicate** (duplicate icon).
3. **Create New Project** opens — enter a **new name** for the copy.
4. Tap **Ok**.

The copy includes cells, groups, and settings from the source project. Review overloads and names before using it on site.

### 6.5 Delete a project

1. Open **Settings** for the active project.
2. Tap **Delete** (trash icon) in the top bar.
3. In the **Delete Project** dialog, select the project to delete.
4. Confirm deletion.

⚠️ **Warning:** Deletion is **permanent** for that project on the device (configuration and associated data). Export first if you need a backup.

### 6.6 Export a project (CSV)

1. Open **Projects** → **Project List**.
2. Next to the project name, tap the **download** icon (Export).
3. On a mobile device, a CSV file is generated and the system **share** menu opens (save to files, email, etc.).
4. In a web browser, the file downloads directly.

Use export as a **backup** or to transfer configuration to another device.

### 6.7 Import a project (CSV)

1. Open **Projects** → **Project List**.
2. Tap **Import** (bottom of the dialog).
3. Select a **CSV** file previously exported from Ron Stage Master.

**If a project with the same name already exists**, the app asks:

- **Overwrite** — replaces the existing project, or
- **Choose new name** — imports with another name.

If the CSV format is invalid, you will see *Failed to import project. Check CSV format.*

---

## 7. General project settings (More Settings)

### 7.1 How to open More Settings

There are two access paths:

| From | Action |
|-------|--------|
| **After creating a project** | Opens automatically |
| **Settings** (cell screen) | Tap the **Settings** (gear) button in the top bar |

The dialog is titled **More Settings**.

> ℹ️ **Note on units:** the usual weight unit change (KG / LBS / M.TON) is done from **Monitor**, tapping **Units: …** in the header (see § 5.5). More Settings also allows adjusting units when creating the project; use whichever method is more convenient.

### 7.2 More Settings fields

| Field | Description | Required |
|-------|-------------|-------------|
| **Units** | Project weight unit: **KG**, **LBS**, or **M.TON** | Yes |
| **Total Overload** | Weight limit for the **total sum** of cells in Total Sum | Yes — cannot be 0 |
| **Reports Cycle** | Toggle that **enables or disables** automatic historical logging | No (off by default) |
| **Report interval (seconds)** | How often a sample is saved to history (1–86400, max. 24 h) | Only if Reports Cycle is enabled |
| **Pre-overload Warning (%)** | Early warning percentage relative to overload (1–99) | Yes — cannot be 0 |

### 7.3 Total Overload

Defines the weight cap for **Total Weight** in Monitor (sum of cells in Total Sum mode).

- Must be a value **greater than zero**.
- If this limit is exceeded in Monitor, the **TOTAL OVERLOAD** alarm appears.
- When you change the project unit, the app may **convert** the Total Overload value to the new unit.

**Example:** with units in KG and Total Overload = 500, the sum of all Total Sum cells should not exceed 500 kg without triggering an alarm.

### 7.4 Pre-overload Warning (%)

Percentage that defines a **warning before** reaching the configured overload.

- Typical value when creating a project: **100** (effectively disables early warning in practice, because the threshold matches 100% of overload).
- For a useful warning, use a value between **1 and 99** (e.g. **80** = warning at 80% of overload).

**Example:** cell overload = 1000 kg, pre-overload = 80% → **PRE OVERLOAD** warning above 800 kg and **OVERLOAD** above 1000 kg.

### 7.5 Reports Cycle and interval

| Option | Function |
|--------|---------|
| **Reports Cycle** (toggle) | Enabled: the app **saves readings** to history for review in **Reports**. Disabled: no automatic logging (live Monitor still works). |
| **Report interval (seconds)** | Sampling frequency. Default **60** s. Valid range: **1** to **86400** (24 hours). |

If Reports Cycle is disabled, opening **Reports** shows a message indicating the cycle is disabled.

### 7.6 Save More Settings

1. Review all fields.
2. Tap **Ok**.

If **Total Overload** or **Pre-overload** are empty or zero, the app shows an error and **does not save**:

- *Total overload can't be 0. Please set it first*
- *Preoverload can't be 0. Please set it first*

When saved successfully, *Project settings successfully updated* appears.

---

## 8. Settings — Load cells (LCs)

The **Settings** screen is the center for cell management. Access from menu **☰ → Settings**.

### 8.1 Settings overview

The screen is organized in three areas:

```
┌─────────────────────────────────────────────────────────┐
│  Top bar: units | project | Settings │ Dup │ Del │
├─────────────────────────────────────────────────────────┤
│  GROUP strip (name + overload per group)         │
├─────────────────────────────────────────────────────────┤
│  [Add LC]  [Edit LC]                    [Delete LC]     │
│  Total load cells: N                                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Table: Id | Name | Capacity | Underload | ...    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

Below the buttons the counter **Total load cells: N** is shown.

### 8.2 Add cells (Add LC)

1. Tap **Add LC**.
2. Complete the **Add LC** dialog form:

| Field | Description |
|-------|-------------|
| **Name** | Descriptive name (optional; can repeat across cells in the same batch) |
| **ID's** | Cell ID range or list. Format: `10-15,18,25-46` (ranges with hyphen, individual IDs separated by comma) |
| **P.S.W** | Preset starting weight (offset). Default 0 |
| **Underload** | Lower alarm threshold. Default **-10** |
| **Overload** | Upper alarm threshold for the cell. **Required** and greater than 0 |
| **Total** (toggle) | **Total Sum** — if enabled, the cell adds to Monitor Total Weight |
| **Groups** | Checkboxes for groups the cell belongs to (appear after groups are defined) |

3. Tap **Save**.

**During creation** the message *Creating load cells...* may appear while many IDs are processed.

**Validation on save**

| Error | Cause |
|-------|--------|
| *Overload must be bigger than 0* | Overload missing or ≤ 0 |
| *Underload can't be higher than Overload* | Underload greater than overload |
| *P.S.W can't be negative* | Negative PSW |
| *Invalid unit id* | ID not recognized in capacity table |
| *Overload can't be higher than capacity* | Overload exceeds nominal capacity for the ID |
| *Those units already added to the project* | Some ID already exists in the project |
| *Cannot create new load cells while an overload or underload alert is active* | An alarm is active on screen — dismiss it before adding |

**Automatic capacity:** when you enter a valid ID, the app assigns **nominal capacity** according to the ID range (Appendix A). You do not need to enter capacity manually.

**Monitor requirement:** mark **Total** on at least **one** cell in the project.

### 8.3 Edit an individual cell

1. In the table, tap any cell in the row (Id, Name, Capacity, etc.).
2. **Edit LC** opens with that cell's data.
3. Modify the necessary fields.
4. Tap **Save**.

You can also **Duplicate** (create another cell with the same parameters, entering a new ID) or **Delete** (remove only that cell) from the bottom of the dialog.

### 8.4 Bulk edit (Edit LC)

To change the same parameter on several cells at once:

1. Tap the **Edit LC** button (above the table).
2. In the bulk edit dialog, specify target **IDs** and fields to overwrite (name, PSW, underload, overload, Total Sum, groups).
3. Confirm.

Useful when many cells share the same overload or group.

### 8.5 Delete cells

1. Check the **Check** box on each row to delete (or the header checkbox to **select all**).
2. Tap **Delete LC** (red button).
3. Confirm in the dialog *Are you sure you want to delete selected Load Cells?*

Deleted cells are removed from the project. If a group is left with no assigned cells, the app may **reset** its overload (you will need to configure it again).

### 8.6 Table columns

| Column | Content |
|---------|-----------|
| **#** | List index |
| **Id** | Numeric cell ID |
| **Name** | Name |
| **Capacity** | Nominal capacity in project units |
| **Underload** | Lower threshold |
| **Overload** | Upper threshold |
| **P.S.W** | Preset starting weight |
| **Total** | Yes / No (Total Sum) |
| **Groups** | Assigned group IDs (e.g. `1,3`) |
| **Check** | Selection for deletion |

The table supports **sorting** by tapping each column header.

---

## 9. Settings — Groups and group overload

**Groups** organize cells for Monitor, Tare, Zero, and aggregated alarms. **Without at least one group with overload defined (> 0), you cannot open Monitor.**

### 9.1 Group strip

At the top of **Settings**, a horizontal strip shows **one box per group**:

| Upper half | Group name (only if overload is configured) |
|----------------|------------------------------------------------------|
| Lower half | Numeric **overload** value for the group |

- Tap a box to **edit** that group.
- Groups are created automatically when you **assign a group ID** to a cell (see § 9.2).

### 9.2 Assign cells to groups

When adding or editing a cell in **Add LC / Edit LC**, check the corresponding **Groups** boxes.

- Groups are identified by **number** (1, 2, 3…).
- A cell can belong to **several groups**.
- When you save a cell with new groups, the app **activates** those groups in the top strip (with initial overload 0 until you define it).

You can also enter group IDs in bulk edit, separated by comma (e.g. `1,2`).

### 9.3 Define group overload

1. In the group strip, tap the group box.
2. The **Group N** dialog opens:

| Field | Description |
|-------|-------------|
| **Group Name** | Visible name (e.g. `Front`, `Grid A`). Default `Grp N` |
| **Overload** | **Aggregated** weight limit for the group. **Must be greater than 0** |

3. Tap **Ok**.

**Validation:** if overload is **0 or empty**, you will see *Overload must be bigger than 0* and it will not save.

### 9.4 Requirement to open Monitor

Before entering Monitor, the app checks:

| Requirement | Message if failed |
|-----------|------------------|
| At least 1 cell in **Total Sum** | *At least 1 LC must be total sum mode* |
| At least 1 group with overload **> 0** | *You Must First set at Least One Group* |
| No group with overload = **0** among those with a value | *{group name} Can't be 0* |

**Minimum recommended sequence**

1. Add cells and mark **Total** on at least one.
2. Assign each cell to its **group** (Groups checkboxes).
3. Tap each group in the strip and define **overload > 0** and name.
4. Open **Monitor** from the menu.

### 9.5 Group ↔ Monitor alarm relationship

- **Group overload** is the limit for the **sum of weights** of cells in that group.
- If exceeded, **OVERLOAD** alarm appears (or **DANGER** if it reaches 130% of the limit).
- **TARE** and **ZERO** group actions (in Monitor) affect all cells in the selected group.

### 9.6 Check before connecting the PRR

With project, cell, and group configuration complete, you can:

1. Open **Monitor** and arrange the layout (Part IV).
2. Connect the **PRR** when ready (Part V).

You do not need the PRR connected to configure Settings, but you **do** need it for live weights and Zero.

---

# Part IV — Monitor View

Monitor is the main **live monitoring** screen. Here you see weight per cell and per group, alarms, PRR status, and rig layout.

---

## 10. Accessing Monitor and initial checklist

### 10.1 How to open Monitor

1. Menu **☰ → Monitor**.
2. The app checks that the active project meets requirements (Part III, § 9.4).
3. If everything is correct, it enters **Monitoring Screen**.

If configuration is missing, you will see an error message and must correct Settings or More Settings before continuing.

> ℹ️ **Note:** You can open Monitor **without a connected PRR** to prepare the layout. Live readings and Zero/Tare actions require a connected PRR.

### 10.2 "Before You Start" checklist

Before applying load on site, verify these points (content of the app's **Before You Start** list):

| # | Check |
|---|--------------|
| 1 | **Load cells are powered on** |
| 2 | The **PRR is powered on** |
| 3 | The **overload of each LC** is correct |
| 4 | The **overload of each group** is correct |
| 5 | The project **Total Overload** is correct |
| 6 | (Same verification of project total limits) |
| 7 | **Cell batteries** are adequate for the event |
| 8 | You have performed **ZERO** on the cells **before** applying weight |

### 10.3 Recommended sequence when entering Monitor

1. Check units (**Units: …** in header).
2. Connect PRR (**Connect Device**) when you will operate with real weight.
3. Arrange cells in **View** mode (if using a floor plan with image).
4. Perform **ZERO** with cells unloaded.
5. Monitor weights and alarms.

---

## 11. Screen components

### 11.1 General layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰ │ Total Weight │ Units: KG │ BLE/PRR │ Project | Plan │ ⚠ │ mode │ MAX │ TARE │ LOAD │ 📄 │
├──────────────────────────────────────────────────────────────────────────┤
│  Group 1  │  Group 2  │  Group 3  │ ...  (weight summed per group)         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   [Home]  │              Main area (View / List / Prog / Stop)      │
│   col.    │                                                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Header (top bar)

| Element | Function |
|----------|---------|
| **☰** | Side menu |
| **Total Weight** | Sum of cells in **Total Sum**. Red if Total Overload exceeded or if no PRR |
| **Units: KG** (etc.) | Active unit; **tap** to change KG / LBS / M.TON |
| **Bluetooth icon + PRR name** | Link status; PRR battery (%). Tap name or battery to **disconnect** |
| **Project name — Monitoring Screen** | Active project |
| **Plan name** (e.g. *General Plan*) | Tap to open the **Plans** dialog |
| **⚠ icon (warnings)** | Opens session warning history |
| **Mode icon** | Cycles View → List → Prog → Stop → View… |
| **MAX** | Shows session **maximum** value on cells (enables LOAD) |
| **TARE** | Toggles **Gross / Net** display (does not execute tare by itself) |
| **LOAD** | Toggles cell icons: **weight** or **battery** |
| **Document icon** | **Export snapshot** (CSV or PDF) |

### 11.3 Group strip

Below the header, a row of **boxes per group**:

| Upper half | Group name (blue background; red if group overload) |
|----------------|----------------------------------------------------------|
| Lower half | **Summed weight** of the group in project units |

Without a connected PRR, the sum shows **Tr.Err**.

The visually **selected** group box (highlight / show only) has a **blue ring** around it.

### 11.4 Main area

Depending on the active mode (mode icon in header):

| Mode | Component |
|------|------------|
| **View** | **Home** column + stage with background image (optional) and cells |
| **List** | Table with Id, Name, Load, Battery, Underload, Overload, etc. |
| **Prog** | Mosaic of progress bars relative to each cell's overload |
| **Stop** | Mosaic of cells with highlighted value; shows **DANGER** if applicable |

In **List**, **Prog**, and **Stop** the area **scrolls vertically** if there are many cells.

### 11.5 Layout toolbar (View only)

On the right edge of the stage, a collapsible panel (**»** / **«**) with image and layout tools (detail in § 12.4).

---

## 12. View mode — floor plan and layout

### 12.1 Home column and stage

**View mode** divides the screen into:

| Zone | Content |
|------|-----------|
| **Home column** (left) | Cells **not placed** on the floor plan ("home" position) |
| **Stage** (right) | Background image (optional) and cells **placed** on the rig |

Cells in Home and on the stage show ID, weight (or battery per LOAD), alarm state (color), and ring if the group is highlighted.

### 12.2 Move cells between Home and stage

| Gesture | Action |
|-------|--------|
| **Single tap** on cell in **Home** | Sends it to the **first free slot** on the stage |
| **Double tap** on cell on **stage** | Returns it to **Home** |
| **Drag** cell on stage | Changes its position on the floor plan |
| **Drag** cell from stage toward Home column | Returns it to Home |

If there are **many cells in Home**, scroll the Home column vertically (touch scroll in the left strip).

### 12.3 Background image

You can work **with or without an image**. Without an image, placed cells can still be arranged in the stage area.

**Add image** (layout side bar, § 12.4):

| Button | Source |
|-------|--------|
| **Gallery** icon | Image from device gallery |
| **Camera** icon | New photo |

**With image loaded:**

| Button | Action |
|-------|--------|
| **Edit** (pencil) | Crop, move, and adjust image zoom |
| **Remove** (×) | Removes background image from the current plan |

**Stage zoom:** with two fingers you can **pinch-to-zoom** on the image to zoom in or out (does not change saved image size, only display).

### 12.4 Layout tools (right panel)

Tap **»** to expand the panel; **«** to hide it.

| Icon | Function |
|-------|---------|
| **Gallery / Camera** | Add background image |
| **Edit / Remove** | Only if an image exists |
| **Lock** | **Locks** or unlocks layout (prevents accidental cell moves) |
| **Grid / apps** | Toggles cell icon size: **large** or **small** (remembered on device) |
| **Home** | Sends **all** stage cells to Home (with confirmation if cells are on the plan) |
| **Undo arrow** | **Undoes** the last position change (up to **10** steps) |

While a bulk layout operation runs (send all to Home), a progress indicator may appear on screen.

### 12.5 Layout lock

With the **lock closed**:

- You cannot drag cells or send them between Home and stage.
- Home and Undo tools are disabled.

Use it during the show to avoid accidental changes.

### 12.6 Cell colors (View)

Cell background or border reflects state (with MAX off):

| State | Visual indication |
|--------|-------------------|
| Normal | Gray / standard |
| **Pre-overload** | Yellow warning |
| **Underload** | Alert (red border) |
| **Overload** | Alert |
| **Danger** (≥ 130% overload) | Severe alert; Stop mode may show **DANGER** text |
| **Tare active** + global TARE ON | Cyan tone / **NET** |
| **Tr.Err** | Transmission error |

---

## 13. List, Prog, and Stop modes

Tap the **mode icon** in the header to cycle. The cycle is: **View → List → Prog → Stop → View**.

### 13.1 List (table)

Tabular view for quick reading of many cells.

Typical columns: **Id**, **Name**, **Load**, **Battery**, **Underload**, **Overload**, **Maximum**, **Group**, etc.

- With **MAX** enabled, the load column shows the session maximum.
- With **LOAD** disabled, battery information is prioritized where applicable.
- **Long press** (~0.6 s) on a row: starts **ZERO** for that cell (with PRR connected).

### 13.2 Prog (progress bars)

Each cell is shown as a **vertical bar** indicating how close it is to the configured overload (100% = at the limit).

Useful to see at a glance which cells are approaching the limit.

- Alarm colors same as View (pre-overload, overload, danger, underload).
- **Long press** on a cell: individual **ZERO**.

### 13.3 Stop (stop / summary)

Mosaic of **large cards** per cell with the current value (or **DANGER** if applicable).

Designed for clear reading at a stop or review moment.

- **Long press**: individual **ZERO**.

### 13.4 "Show only group" filter

If you enabled **Show only this group's LCs** on a group (§ 15.2), **List**, **Prog**, and **Stop** show **only cells in that group**. In **View**, other cells are hidden from the stage.

---

## 14. Monitor plans

A **monitor plan** defines, for the same project:

- Which **groups** are visible.
- The **background image** and cell **positions** (layout per plan).

Each project has at least the **General Plan** (cannot be deleted).

### 14.1 Open the Plans dialog

In the Monitor header, tap the **active plan name** (next to the project title).

The **Plans** dialog opens with the project's plan list.

### 14.2 Select a plan

Tap the plan **name** in the list. Monitor switches to the layout and image saved for that plan.

### 14.3 Create a new plan

1. In **Plans**, tap **+ New plan**.
2. Enter **Plan Name**.
3. Check the **groups included** in the plan.
4. Tap **Save**.

The new plan becomes active. Place image and cells; they are saved **only in that plan**.

### 14.4 Edit, rename, or delete

For each plan (except **General Plan**):

| Button | Action |
|-------|--------|
| **Edit** | Change included groups (removing a group may reset saved positions of its cells) |
| **Rename** | Change the name |
| **Delete** | Delete the plan |

**General Plan** can only be **selected**, not edited or deleted from these buttons.

### 14.5 Best practices with plans

- Use **General Plan** as the full rig view.
- Create secondary plans for **phases** or **zones** (e.g. front only, upper grid only).
- When switching plans, verify that **group overload** remains valid for visible groups.

---

## 15. Buttons and actions

### 15.1 Group strip interaction

| Gesture | Requirement | Action |
|-------|-----------|--------|
| **Single tap** | — | Toggles **Show only this group's LCs** (only that group on screen). Second tap on same group: removes filter |
| **Double tap** (two quick taps) | PRR connected | Opens **Group Actions** (Tare, Zero, highlight, show only) |
| **Long press** (~0.6 s) | PRR connected | Opens **group ZERO** confirmation (two-step Next) |

If the group has duplicate cells or cells not transmitting, the app may show an error before the action.

### 15.2 Group Actions dialog (double tap on group)

| Control | Function |
|---------|---------|
| **Tare** / **Cancel Tare** | Applies or cancels **group tare** |
| **Zero** | Goes to **group ZERO** flow (2 confirmations) |
| **Highlight LC's** | Highlights group cells with a ring on the stage |
| **Show only this group's LCs** | Hides other cells |

**Group tare:** all cells in the group must have weight **> 0**; otherwise you will see *One or more of your LC's load <= 0*.

### 15.3 TARE button in header

| Function | Detail |
|---------|---------|
| **Toggle Gross / Net** | If groups are in tare, changes whether cells show gross or net weight |
| **Quick group tare** | If a group is in visual mode (highlighted or show-only), tapping **TARE** applies **Tare** or **Cancel Tare** to **that** group without opening the dialog |

If no group is visually selected: *Select a group first (Highlight or Show only), then press Tare.*

Requires **PRR connected**.

### 15.4 Group ZERO

1. **Long press** on the group box, or **Zero** inside Group Actions.
2. Read the warning: *Zero is unreversible…*
3. Tap **Next** twice to confirm.

**Effects:** redefines zero for all cells in the group; **PSW** returns to 0.

**Blocks:**

- Without PRR: *Please connect your PRR first*
- If any cell in the group exceeds **30% of its nominal capacity** (load on sensor): *Zero not allowed* — unload first

### 15.5 Individual cell ZERO

In **View**, **List**, **Prog**, or **Stop**:

1. **Long press** (~0.6 s) on the cell.
2. Confirm with **Next** twice.

Same rules as group ZERO, but **only that cell**. Not allowed if the cell is in **Tr.Err** or has no valid reading.

### 15.6 MAX and LOAD

| Button | Behavior |
|-------|----------------|
| **LOAD** | ON: weight on icons; OFF: battery |
| **MAX** | ON: session maximum value; disabling MAX also disables forced LOAD dependency |

### 15.7 Warning list (⚠ icon)

Opens **current session** alarm history:

| Column | Content |
|---------|-----------|
| Time | Warning time |
| LC | Cell, group, or *Total Sum* / *Pre Overload* |
| Value | Weight at the moment |
| Overload / Underload | Reference limits |

You can **clear** the list with the corresponding button in the dialog. On-screen toasts are independent: closing a toast does not necessarily clear history until it is recorded there.

### 15.8 Export snapshot

1. Tap the **document** icon in the Monitor header.
2. Choose **CSV** or **PDF**.
3. On mobile, use the system share menu to save or send.

The snapshot includes current state of cells and groups, PRR, battery, totals, and (in PDF) the **report header** configured in Reports. PDF title: **Snapshot Report**.

---

## 16. Alarms and warnings

### 16.1 Alarm types

| Type | When it triggers |
|------|-------------------|
| **UNDERLOAD** | Weight below cell underload |
| **PRE OVERLOAD** | Weight above pre-overload threshold (% of overload) |
| **OVERLOAD** | Weight above overload (cell or group) |
| **DANGER** | Weight ≥ **130%** of configured overload |
| **TOTAL OVERLOAD** | Total Sum exceeds project **Total Overload** |

### 16.2 How they are shown

| Channel | Behavior |
|-------|----------------|
| **On-screen toast** | Red message with type, ID, and weights; stays until you close it |
| **Sound** | Beep when a new alarm appears |
| **Cell / group color** | Background or border by severity |
| **Total Weight** | Red background if Total Overload exceeded |
| **⚠ history** | Log with time and values (§ 15.7) |

Tapping a toast to close it may register the dismissal in the alarm flow.

### 16.3 Tr.Err and alarms

With **Tr.Err** (no transmission):

- Overload/underload are not evaluated on that reading.
- The cell or group may show **Tr.Err** instead of a number.
- **Total Weight** shows Tr.Err if there is no PRR.

Do not make load decisions based on cells in Tr.Err.

### 16.4 Visual priority (summary)

```
Normal  →  Pre-overload (yellow)  →  Overload  →  Danger (130%)
                ↓
           Underload (below minimum)
```

### 16.5 What to do when an alarm occurs

1. **Identify** cell or group in the toast or group strip.
2. **Reduce load** or stop movement per your rigging procedure.
3. **Do not ZERO** with load applied if weight exceeds 30% of capacity.
4. If the alarm is due to **Tr.Err**, check PRR, batteries, and range before continuing.
5. Review **⚠** history at the end of the incident for documentation.

---

# Part V — PRR connection

The **PRR** (Eilon portable receiver) is the bridge between load cells (radio) and the tablet (Bluetooth). This part describes how to **connect**, **monitor the link**, and **operate** with live readings.

> **When to connect:** after the project is configured (Part III) and, if desired, the Monitor layout is prepared (Part IV). For **Zero**, **Tare**, and real-time weights, the PRR must be connected.

---

## 17. Connect Device

### 17.1 Open connection

1. Menu **☰ → Connect Device**.
2. The app **automatically starts** Bluetooth scanning for the **PRR** (no additional button tap required).
3. The **Available devices** dialog appears with detected receivers.

You can also open Connect Device while already in **Monitor**; scanning works the same.

### 17.2 Requirements before scanning

| Platform | Requirement |
|------------|-----------|
| **iOS / iPadOS** | **Bluetooth** enabled. The app may request Bluetooth permission the first time. |
| **Android** | **Bluetooth** enabled and **location / GPS** enabled (system requirement for BLE scanning). |

If Bluetooth is off, you will see *Please, turn on Bluetooth.*

If location is disabled on Android, a **Location Disabled** warning appears with **Go to Settings** to open system location settings.

### 17.3 During scanning

| On-screen element | Meaning |
|----------------------|-------------|
| **Spinner + "Scanning for devices…"** | Scan in progress; the list **updates live** as devices are found |
| **Cancel** | Stops scanning and closes the dialog |
| **Device name** | Name advertised by the PRR (or *Unknown device* if no name) |
| **ID / address** | BLE identifier (on iOS usually a UUID) |
| **RSSI … dBm** | Signal strength (closer to 0 = stronger signal) |
| **Connect** | Starts connection to that PRR |

Scanning continues until you tap **Cancel**, connect a device, or close the dialog.

> ℹ️ **Tip:** Move the tablet closer to the PRR. If no device appears, verify the PRR is powered on and reopen **Connect Device**.

### 17.4 Connect a PRR

1. In the list, tap **Connect** next to the correct PRR.
2. The app establishes the BLE link (may take a few seconds; maximum connection time ~20 s).
3. If connection succeeds:
   - The devices dialog closes.
   - In **Monitor**, the Bluetooth icon shows **connected**.
   - The **PRR name** and receiver **battery percentage** appear in the header.

### 17.5 Up to 2 PRRs simultaneously

The app allows connecting **at most 2 PRRs** at once.

- If 2 links are already active and you try a third, you will see: *You can connect up to 2 PRRs at the same time.*
- In the Monitor header **both** names are shown with their battery, side by side.

Use two PRRs only when your rig requires it; in most cases **one** receiver is enough.

### 17.6 Common connection errors

| Message / situation | What to do |
|---------------------|-----------|
| *There is already a Bluetooth scan in progress* | Wait or close the previous scan dialog |
| *Bluetooth scan failed* | Restart Bluetooth, move closer to the PRR, and retry |
| *No devices found. Move closer and try again.* | Power on the PRR, reduce distance and interference |
| Connection does not complete | Power cycle the PRR; close other apps using BLE; retry |

### 17.7 Disconnect manually

From **Monitor**, in the header:

1. Tap the **PRR name** or its **battery** icon.
2. Confirm **Disconnect** in the confirmation dialog.

Manual disconnect **does not** enable automatic reconnection (see § 18.4).

---

## 18. Operation with PRR connected

### 18.1 Live readings

With the PRR connected and cells transmitting:

| Where | What you see |
|-------|----------|
| **Cell icons** (View) | Current weight (or battery if LOAD is off) |
| **Group strip** | Summed weight per group |
| **Total Weight** | Sum of cells in **Total Sum** |
| **List / Prog / Stop** | Updated values per cell |

Weights refresh automatically as packets arrive from the PRR.

### 18.2 Tr.Err right after connecting

It is **normal** for cells to briefly show **Tr.Err** after connecting a PRR:

1. When the link is established, the app **resets** freshness state for each cell.
2. Each cell shows a valid reading when it receives its **first new packet** from the PRR.

Wait a few seconds. If **Tr.Err** persists on a specific cell, verify that LC is powered on and within PRR range.

### 18.3 Signal loss and Tr.Err during monitoring

The app monitors data **freshness**:

| Situation | Behavior |
|-----------|----------------|
| A cell stops sending data (~2 s without a new sample) | That cell goes to **Tr.Err** |
| The entire link stops receiving data (~4 s without global activity) | **All** cells may go to **Tr.Err** |
| Packets return | Readings restore automatically |

### 18.4 Automatic reconnection

If the BLE link is **lost without you disconnecting** (PRR out of range, low battery, interference), the app tries to **reconnect automatically** to the same PRR:

- Retries with increasing wait (from ~1.5 s up to a maximum of ~30 s between attempts).
- If you open **Connect Device** or manually connect another device, automatic reconnection in progress is **cancelled** in favor of your manual action.

If **you disconnect** from Monitor (§ 17.7), there is **no** automatic reconnection.

### 18.5 PRR battery

In the Monitor header, next to each connected PRR name:

- **Battery** icon with **percentage**.
- Tap the name or battery to **disconnect** that PRR.

Keep the PRR charged; low battery can cause link drops and **Tr.Err**.

### 18.6 Cell batteries

Enable the **LOAD** button in the Monitor header to toggle between **weight** and **battery percentage** on each cell icon.

Check LC batteries before and during the event (checklist § 10.2, item 7).

### 18.7 Zero and Tare with PRR connected

| Action | Requirement |
|--------|-----------|
| **ZERO** (group or cell) | PRR connected and valid reading (no Tr.Err on target cell) |
| **TARE** group (bar or Group Actions) | PRR connected |
| **Double tap** on group (Group Actions) | PRR connected |

Without PRR you will see: *Please connect your PRR first*.

Always perform **ZERO with cells unloaded** and before applying working load (see Part IV, § 15.4 and § 15.5).

### 18.8 Background operation

The app is designed to maintain the BLE link during monitoring, including periods when the app goes to the **background** (per Bluetooth permissions on iOS).

Best practices:

- Do not force-close the app during an active show.
- Keep the tablet **charged** and Bluetooth enabled.
- After a prolonged outage, verify in Monitor that the PRR icon is still **connected** and weights are updating.

### 18.9 Typical operational sequence with PRR

```
1. PRR powered on + cells powered on
2. ☰ → Connect Device → Connect (correct PRR)
3. Wait for initial Tr.Err on cells to clear
4. ZERO (group or cells, no load)
5. Monitor weights and alarms
6. When finished: disconnect PRR from header (optional)
```

### 18.10 Relationship with historical reports

PRR connection feeds **live monitoring**. **Historical logging** for **Reports** additionally requires **Reports Cycle** enabled in More Settings (Part VI).

PRR link events (connected / disconnected) may be logged in history when the report cycle is active.

---

# Part VI — Reports

The **Reports** module queries **reading history** saved on the device while monitoring was active with **Reports Cycle** enabled (see § 7.5).

---

## 19. Reports

### 19.1 Open Reports

1. Menu **☰ → Reports**.
2. The reports screen opens with two areas:
   - **Left:** **My Projects** list and **Storage** bar.
   - **Right:** filters, table, and export.

On entry, the app **does not load data automatically**. You must tap **Refresh** to query history.

### 19.2 Requirement: Reports Cycle enabled

History is only recorded if in the project's **More Settings** you have **Reports Cycle** enabled and a **Report interval** defined (Part III, § 7.5).

If you try to load a project with the cycle **disabled**, you will see:

- *Reports Cycle is disabled*
- *Reports are not available. Please enable Reports Cycle in project settings to view reports.*

Enable the cycle, save More Settings, and return to Monitor for samples to start recording.

### 19.3 Select project

In **My Projects**, tap the name of the project whose history you want to query.

- The selected project is highlighted with a blue border.
- By default the **active Monitor project** usually appears; you can switch to another in the list.

Above the filters you will see: *Showing reports for: **Project name***.

### 19.4 Storage bar

In the left column, the **Storage** block shows device space usage:

| Segment | Meaning |
|----------|-------------|
| Gray | Other system / app data |
| Blue (primary) | App report data |
| **Free** text | Free space |

If **less than 10%** remains free, a warning appears: the app may **automatically delete** the oldest report records when saving new data.

### 19.5 Filters

#### Status (toggles)

You can include or exclude rows by reading status:

| Toggle | Includes |
|--------|---------|
| **Ok** | Normal readings |
| **Overload** | Overload |
| **Danger** | Danger (≥ 130% of overload) |
| **Underload** | Below lower threshold |
| **Tr.Err** | Transmission error |

All are **enabled** by default. Disable those you do not want to see.

> ℹ️ When you change any filter, the notice *Filters changed. Press Refresh to apply.* appears — on-screen data **does not** update on its own.

#### Date range

| Field | Function |
|-------|---------|
| **From** | Start date (inclusive) |
| **To** | End date (inclusive) |

By default the **current day** is usually shown.

#### Time range (single day only)

If **From** and **To** are the **same day**, you can further restrict by time:

| Field | Function |
|-------|---------|
| **Hour from** | Start time (e.g. 08:00) |
| **Hour to** | End time (e.g. 18:00) |

If the range spans **multiple days**, time fields are **disabled**.

#### Load limit

The app can load up to **300,000** records for display and export. If more match, it shows the **most recent** and warns to narrow the range or filters.

### 19.6 Load the report (Refresh)

1. Configure project, dates, time (if applicable), and status toggles.
2. Tap the **Refresh** button (blue circular icon).

During loading you will see a progress indicator (*Loading report…*). You can tap **Cancel** to abort.

If there is no data for the chosen filters:

*No reports found for the selected date range and filters. Check status toggles (OK / Overload / Danger / Underload / Tr.Err).*

### 19.7 Results table

Data is grouped in **time intervals** according to the project **Report interval** (e.g. every 60 seconds).

Each table block has a **blue header** with the interval timestamp (e.g. `2026-06-16 14:30:00`).

Columns per row:

| Column | Content |
|---------|-----------|
| **Title** | Cell name, or *PRR connected* / *PRR disconnected* |
| **ID** | Cell ID, or PRR name on link events |
| **Status** | OK, OVERLOAD, DANGER, UNDERLOAD, TR.ERR, etc. |
| **Gross** | Gross weight |
| **Net** | Net weight (if tare applied in the record) |
| **Battery** | Cell battery |
| **Time** | Exact date and time of the sample |

#### Pagination

The table shows **10 intervals per page**. Use **‹** and **›** at the bottom to change pages.

### 19.8 Delete records

The **Delete** button (red trash) deletes **only** rows that match:

- Selected project
- Date range (and times, if applicable)
- Active status toggles

1. Tap **Delete**.
2. Confirm in the dialog: *Delete only logs matching current project + date/status/hour filters?*

⚠️ **Warning:** Deletion is **irreversible**.

After deleting, tap **Refresh** to update the view.

### 19.9 Export report

You must **load** the report with **Refresh** first. Then use the **Export:** row:

| Format | Use |
|---------|-----|
| **CSV** | Spreadsheet, full analysis, large files |
| **PDF** | Printable report with branding header |

On **mobile** (iOS/Android), export opens the system **share** menu to save or send the file.

#### CSV content

- Initial lines with **metadata** (project, artist, city, user, website, date range, etc.).
- **Logo** is not embedded in CSV; metadata may note that logo is PDF-only.
- Rows: Name, ID, Status, Gross, Net, Battery, Time.

#### PDF content

- Document title: **Report**.
- **Header** with logo (if configured), project data, and **QR** code (optional).
- Table with the same columns as on screen.
- On very large native PDF, only the **first 1,500** rows may export; use **CSV** for full history.

If you export without loading first: *No data to export. Load a report first.*

### 19.10 Configure report header

Tap **Report header** (pencil icon) to open **Report header & branding**:

| Field | Description |
|-------|-------------|
| **Project** | Project name (read-only) |
| **Artist** | Artist / show |
| **City** | City |
| **User** | User or responsible party |
| **Website** | URL (clickable in PDF if valid) |
| **Include QR code** | Toggle for QR code with web link |
| **Company logo** | Gallery or camera; **Clear** to remove |

Tap **Save** to save. Configuration is used in **CSV**, Reports **PDF**, and Monitor **Snapshot** exports.

### 19.11 Typical workflow

```
1. More Settings → Reports Cycle ON + interval (e.g. 60 s)
2. Monitor + PRR connected during the event
3. ☰ → Reports
4. Choose project → From / To → status toggles
5. Refresh
6. Review table → Export CSV or PDF (optional: Report header)
```

### 19.12 Relationship with Monitor Snapshot

| Source | What it captures |
|--------|-------------|
| **Reports** | History over time (while Reports Cycle is active) |
| **Snapshot** (Monitor, document icon) | **Current moment** snapshot of all cells |

Both can use the same **report header**. Snapshot PDF is titled **Snapshot Report**.

---

# Part VII — Troubleshooting and best practices

This part collects the **most common error messages**, the **on-site operational sequence**, and **frequently asked questions**. For detail on each module, see Parts III through VI.

---

## 20. Common errors

Messages cited appear in **English** in the interface by default. The **What to do** column indicates corrective action.

### 20.1 Cannot open Monitor

| Message (approx.) | Cause | What to do |
|------------------|-------|-----------|
| *At least 1 LC must be total sum mode* | No cell has **Total Sum** enabled | Settings → enable **Total Sum** on at least one LC (§ 8.2) |
| *You Must First set at Least One Group* | No groups with overload defined | Settings → create a group and assign **overload** > 0 (§ 9) |
| *{Group name} Can't be 0* | A group has overload **0** | Settings → edit the group and set a valid overload |
| *(No project)* → **Create New Project** dialog | No active project | Projects → create or select a project (§ 6) |

> ℹ️ **Total Overload** and **Pre-overload** at 0 are validated when saving More Settings or when operating alarms; if missing, correct in **More Settings** (§ 7.3–7.4).

### 20.2 Settings errors (cells and groups)

| Message | Cause | What to do |
|---------|-------|-----------|
| *Invalid unit id {ID}* | Cell ID **does not exist** in the capacity table | Check the physical LC label; use a valid ID (Appendix A) |
| *Overload must be bigger than 0* | Group overload empty or zero | Enter a value > 0 when saving the group |
| *Overload can't be higher than capacity* | LC overload greater than nominal capacity for the ID | Reduce overload or verify the ID is correct |
| *Underload can't be higher than Overload* | Underload ≥ overload on the LC | Set underload below overload |
| *P.S.W can't be negative* | Negative PSW when editing LC | Correct the PSW field |
| *Cannot create new load cells while an overload or underload alert is active…* | An alarm is active in Monitor | Dismiss or resolve the alarm; then return to Settings |
| *Total overload can't be 0. Please set it first* | Total Overload not configured | More Settings → **Total Overload** > 0 |
| *Preoverload can't be 0. Please set it first* | Pre-overload not configured | More Settings → **Pre-overload Warning** > 0 |

### 20.3 PRR connection and Bluetooth

| Message / symptom | Probable cause | What to do |
|-------------------|----------------|-----------|
| *Please, turn on Bluetooth.* | Device Bluetooth off | Enable Bluetooth in system settings |
| **Location Disabled** (Android) | GPS / location off | Enable location; in the warning tap **Go to Settings** |
| *Scanning for devices…* with no results | PRR off, out of range, or interference | Power on PRR, move closer, tap **Connect** again after closing and reopening the dialog |
| *No devices found. Move closer and try again.* | Same after scan | Check PRR battery and that it is not connected only to another device |
| *Bluetooth scan failed.* | System scan error | Restart Bluetooth; close other BLE apps; retry |
| *Please connect your PRR first* | Action requiring PRR (Zero, Tare, etc.) without active link | ☰ → **Connect Device** → **Connect** |
| BLE icon **disconnected** in Monitor | No active BLE link | Connect PRR; verify you did not disconnect manually |
| Tr.Err on **all** cells after connecting | Normal at start; or total link loss | Wait a few seconds for samples; if it persists, § 20.4 |

### 20.4 Tr.Err (transmission error)

**Tr.Err** indicates the app **does not receive a valid reading** from that cell at that moment.

| Situation | Common causes | What to do |
|-----------|-------------------|-----------|
| Tr.Err on **one** cell | Cell off, low battery, out of PRR range, ID not configured in project | Verify power, battery (icon in Monitor with **LOAD** ON), ID in Settings |
| Tr.Err on **several** cells | Range, obstacles, radio interference | Move PRR or cells closer; reduce metal obstacles |
| Tr.Err on **all** cells | PRR disconnected, off, or no BLE data | Reconnect PRR; app attempts **automatic reconnection** unless manually disconnected |
| **Intermittent** Tr.Err | Coverage limit or many cells on same PRR | Improve PRR position; check batteries |
| Tr.Err after **returning** to app | App was in background | Wait for link to restore; reconnect if needed |

> ℹ️ With Tr.Err, overload/underload alarms are **not** evaluated on that cell (§ 16.3). Do not use that weight for load decisions.

When **connecting** a PRR, cells may show Tr.Err briefly until the first round of data arrives.

### 20.5 Zero and Tare

| Message / symptom | Cause | What to do |
|-------------------|-------|-----------|
| *Cannot apply ZERO… above 30% of capacity* | Load on sensor > 30% of nominal capacity | Unload the cell or group before Zero |
| *Zero failed.* / error applying Zero | PRR not connected, Tr.Err, or communication failure | Connect PRR; wait for valid reading; retry |
| *Select a group first (Highlight or Show only), then press Tare.* | Quick tare without visually selected group | Tap group name (highlight or show-only) and press **TARE** |
| *One or more of your LC's load <= 0* | Tare with readings not valid for tare | Check PRR and weights before tare |
| Unexpected net weight after Tare | Group in tare mode (NET) | Press **TARE** again for **Cancel Tare** or see § 15.3 |

### 20.6 Reports

| Message / symptom | Cause | What to do |
|-------------------|-------|-----------|
| *Reports Cycle is disabled* | Report cycle off | More Settings → enable **Reports Cycle** (§ 7.5) |
| *No reports found for the selected date range…* | No data in range or restrictive status filters | Widen dates; enable OK / Overload / etc. toggles; tap **Refresh** |
| *Filters changed. Press Refresh to apply.* | Filters changed without reload | Tap **Refresh** |
| *No data to export. Load a report first.* | Export without loaded data | **Refresh** before CSV/PDF |
| Empty table after Refresh | No monitoring with Reports Cycle ON on those dates | Verify Monitor was active with PRR and cycle enabled |
| **300,000** record warning | Too many logs for the range | Narrow dates or filters |
| PDF only **1,500** rows on mobile | Native export limit | Use **CSV** for full history (§ 19.9) |
| **Storage** bar with little free space | Device disk nearly full | Free space; export and delete old reports if appropriate (§ 19.4, 19.8) |

### 20.7 Projects (import / export)

| Message | Cause | What to do |
|---------|-------|-----------|
| *Failed to export project.* | Error generating or sharing CSV | Retry; check disk space |
| *Failed to import project. Check CSV format.* | Corrupt CSV or from another version | Use CSV exported by this app; see Appendix B |
| Imported project without background image | `p_image` field too large or truncated | Reassign image in More Settings if needed |

### 20.8 Quick summary by symptom

```
No weights in Monitor     → PRR connected + cells ON + correct IDs in Settings
Persistent Tr.Err         → Range / battery / PRR reconnection
Monitor won't open        → Total Sum + group with overload + active project
No Reports history        → Reports Cycle ON during event + Refresh
Zero blocked              → Unload below 30% of capacity
```

---

## 21. Recommended on-site sequence

Operational checklist for a rig from scratch. Matches the flow in Parts I–VI.

### 21.1 Before rigging day

| Step | Action | Reference |
|------|--------|------------|
| 1 | Create or **duplicate** a reference project | § 6 |
| 2 | Configure **Total Overload**, **Pre-overload**, and units | § 7.3–7.4 |
| 3 | Add **LCs** with correct IDs; enable **Total Sum** on at least one | § 8 |
| 4 | Create **groups** and define **overload** for each | § 9 |
| 5 | (Optional) Adjust background image and **monitor plans** | § 12.3, § 14 |
| 6 | **Export** the project (CSV) as backup | § 6.6 |
| 7 | Enable **Reports Cycle** and interval if you need history | § 7.5 |
| 8 | Configure **Report header** (logo, artist, etc.) if you will export reports | § 19.10 |

### 21.2 On site — startup

| Step | Action |
|------|--------|
| 1 | Power on **cells** and **PRR**; check batteries |
| 2 | Open the app → select **project** |
| 3 | Review **Settings** if there were last-minute changes |
| 4 | Open **Monitor** → check layout (**View** mode) |
| 5 | ☰ → **Connect Device** → connect **PRR** (up to 2 if applicable) |
| 6 | Verify **Before You Start** checklist (§ 10.2) |
| 7 | With cells **unloaded**, apply **ZERO** (group or individual) |
| 8 | Check units with **Units: …** in header |

### 21.3 During monitoring

| Step | Action |
|------|--------|
| 1 | Watch **Total Weight**, groups, and alarms (toast + ⚠ history) |
| 2 | Use **TARE** only per agreed rigging procedure |
| 3 | On **OVERLOAD** or **DANGER**, act per site protocol |
| 4 | If **Tr.Err** appears, do not decide load until reading recovers |
| 5 | (Optional) **Snapshot** CSV/PDF to document an instant |
| 6 | Keep tablet and PRR **charged** |

### 21.4 At end or between sessions

| Step | Action |
|------|--------|
| 1 | ☰ → **Reports** → date range → **Refresh** |
| 2 | **Export** CSV and/or PDF of history if required |
| 3 | (Optional) **Delete** old logs to free space |
| 4 | **Export** project if configuration changed |
| 5 | Disconnect PRR if monitoring will not continue |

### 21.5 Flow diagram

```
Projects ──► More Settings ──► Settings (LCs + groups)
                                    │
                                    ▼
                              Monitor (layout)
                                    │
                                    ▼
                           Connect Device (PRR)
                                    │
                                    ▼
                              ZERO → operate
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
              Snapshot (instant)              Reports (history)
```

---

## 22. FAQ

### 22.1 General

**Can I use the app without Internet?**  
Yes. Configuration, Monitor, PRR connection, and reports work **without an Internet connection**. Data is stored on the device.

**What orientation should I use on the tablet?**  
**Landscape (horizontal)**. Monitor and layout are optimized for that orientation (§ 3.1).

### 22.2 Projects and configuration

**Can I copy a previous rig?**  
Yes. **Projects → Duplicate** creates a copy with cells, groups, and settings (§ 6.4).

**How do I move a project to another tablet?**  
**Export** CSV on one device and **Import** on the other (§ 6.6–6.7). Reports history **does not** travel in that CSV; export it separately from Reports.

**Why does the app require Total Sum?**  
At least one LC in **Total Sum** feeds the header **Total Weight** and project **Total Overload** alarms.

**Can I change units during the event?**  
Yes, by tapping **Units: …** in the Monitor header. Stored overloads are interpreted in the project unit; change carefully if alarms are active.

### 22.3 Monitor and PRR

**Can I prepare the layout without connecting the PRR?**  
Yes. You can open Monitor and place cells in **View** before connecting. There will be no live weights until the PRR is connected.

**How many PRRs can I connect?**  
Up to **2** receivers simultaneously (§ 17.5).

**Does the app reconnect automatically if I lose the PRR?**  
Yes, it attempts **automatic reconnection**, unless you disconnected manually from Connect Device.

**What does PSW mean?**  
Internal reference accumulated weight for the cell. **ZERO** resets it to zero (§ 5.2).

**Are Zero and Tare the same?**  
No. **ZERO** redefines the sensor zero (irreversible for the session). **TARE** subtracts group rigging weight to show **net** (§ 5.2, § 15.3).

### 22.4 Alarms and safety

**When does DANGER appear versus OVERLOAD?**  
**DANGER** when weight reaches **≥ 130%** of configured overload (§ 16.1).

**Can I silence an alarm?**  
You can **close the toast** by tapping it; ⚠ history keeps the record. You must **reduce load** per your safety procedure.

### 22.5 Reports

**Why is there no data in Reports?**  
Check: (1) **Reports Cycle** active during monitoring, (2) correct project selected, (3) appropriate date range, (4) you tapped **Refresh**, (5) status toggles do not exclude all rows.

**What is the difference between Reports and Snapshot?**  
**Reports** = history over time (with Reports Cycle). **Snapshot** = picture of **current** state in Monitor (§ 19.12).

**Why does the Reports PDF have fewer rows than CSV?**  
On iOS/Android native PDF may be limited to **1,500** rows; CSV includes the loaded set (up to 300,000).

### 22.6 Data and storage

**Where is my data stored?**  
In the device's **local storage** (internal app database). Make **periodic exports** as backup.

**Does the app delete old reports automatically?**  
If free device space drops significantly (&lt; 10%), the app may **purge old records** when saving new data (§ 19.4).

---

# Appendices

---

## Appendix A — Capacities by cell ID

When you enter a cell **numeric ID** in Settings, the app automatically assigns **nominal capacity** according to the internal table `LC_Serials`. If the ID appears in no range, you will see *Invalid unit id*.

Cell and group **overload** values must not exceed nominal capacity (in the project unit).

### A.1 Range and capacity table

| ID range | M.TON | KG | LBS |
|-------------|-------|-----|------|
| 1 – 10 | 0.25 | 250 | 551.25 |
| 250 – 499 | 0.25 | 250 | 551.25 |
| 500 – 999 | 0.5 | 500 | 1,102.5 |
| 1,000 – 1,499 | 1 | 1,000 | 2,205 |
| 1,500 – 1,999 | 1.5 | 1,500 | 3,307.5 |
| 2,000 – 2,499 | 2 | 2,000 | 4,410 |
| 2,500 – 2,999 | 2.5 | 2,500 | 5,512.5 |
| 3,000 – 3,999 | 3 | 3,000 | 6,615 |
| 4,000 – 4,999 | 4 | 4,000 | 8,820 |
| 5,000 – 5,999 | 5 | 5,000 | 11,025 |
| 6,000 – 6,999 | 6 | 6,000 | 13,230 |
| 7,000 – 7,499 | 8 | 8,000 | 17,640 |
| 7,500 – 7,999 | 10 | 10,000 | 22,050 |
| 8,000 – 8,499 | 12.5 | 12,000 | 27,558 |
| 8,500 – 8,999 | 15 | 15,000 | 33,075 |
| 9,000 – 9,249 | 20 | 20,000 | 44,100 |
| 9,250 – 9,499 | 25 | 25,000 | 55,125 |
| 9,500 – 9,999 | 30 | 30,000 | 66,150 |
| 10,000 – 10,249 | 40 | 40,000 | 88,200 |
| 10,250 – 10,499 | 50 | 50,000 | 110,250 |
| 10,500 – 10,599 | 80 | 80,000 | 176,400 |
| 10,600 – 10,699 | 125 | 125,000 | 275,625 |
| 10,700 – 10,799 | 200 | 200,000 | 441,000 |
| 10,800 – 10,899 | 250 | 250,000 | 551,250 |
| 10,900 – 10,999 | 300 | 300,000 | 661,500 |

### A.2 Alternate ranges (same capacity)

Some high IDs share capacity with standard ranges:

| Alternate range | Equivalent to |
|-------------------|---------------|
| 11,000 – 11,899 | 1,000 – 1,499 (1 M.TON / 1,000 KG) |
| 11,900 – 12,799 | 1,500 – 1,999 (1.5 M.TON) |
| 12,800 – 13,699 | 2,000 – 2,499 (2 M.TON) |
| 13,700 – 14,599 | 2,500 – 2,999 (2.5 M.TON) |
| 14,600 – 14,999 | 3,000 – 3,999 (3 M.TON) |
| 15,000 – 15,399 | 4,000 – 4,999 (4 M.TON) |
| 15,400 – 15,799 | 5,000 – 5,999 (5 M.TON) |
| 15,800 – 16,000 | 6,000 – 6,999 (6 M.TON) |

### A.3 Notes

- IDs **1 – 10** correspond to reduced speed/capacity cell types in the table; Monitor use follows the same overload rules.
- **Display resolution** (weight decimals) also depends on ID range; the app applies it automatically.
- If the physical cell ID does not match a table row, correct the ID in Settings or replace the cell per manufacturer documentation.

---

## Appendix B — Exported file structure

### B.1 Project export (CSV)

**Source:** Projects → **Export**  
**Typical name:** `project_backup_{name}_{date}.csv`  
**Encoding:** UTF-8 with BOM (`\uFEFF`)

The file is divided into **sections** in brackets:

| Section | Content |
|---------|-----------|
| `[Project]` | Project data: title, units, total/pre-overload, report cycle, background image (`p_image` in base64), etc. |
| `[Groups]` | Groups: id, title, overload, tare state |
| `[LoadCells]` | Cells: id, title, PSW, overload, underload, groups, View position, zero, tare, total_sum, capacity (JSON) |
| `[MonitorPlans]` | Monitor plans: name, included groups, image per plan |
| `[MonitorPlanLayouts]` | Position of each LC per plan (`view_x`, `view_y`) |
| `[MonitorPlanState]` | Currently selected plan |

> ℹ️ This CSV **does not include** Reports history. To back up historical readings, export from **Reports**.

### B.2 Reports export (CSV)

**Source:** Reports → **Export → CSV**  
**Typical name:** `report_{date}.csv`

Structure:

1. **Metadata header** (lines `# Report`, Project, Artist, City, User, Website, Range, Generated).
2. **Data table:** columns `Name, ID, Status, Gross, Net, Battery, Time`.
3. Rows grouped by time intervals (per project **Report interval**).
4. PRR link events as *PRR connected* / *PRR disconnected* rows.

### B.3 Reports export (PDF)

**Document title:** **Report**  
Includes header with logo (if configured), project metadata, optional QR code, and readings table. On mobile, maximum **1,500** rows per PDF.

### B.4 Monitor Snapshot (CSV / PDF)

**Source:** Monitor → document icon → CSV or PDF  
**PDF title:** **Snapshot Report**

**CSV — approximate order:**

1. Branding header (same as Reports).
2. `PRR` line with ID, status, and battery.
3. `Total Sum` line with dual KG/LBS weight.
4. Table of all LCs: `#, Name, ID, Status, Gross, Net, Battery, Time`.
5. Blocks per **group** with dual total and cell subtable.

**PDF:** same data in printable format with report header.

### B.5 Common conventions

| Aspect | Detail |
|---------|---------|
| Separator | Comma (`,`) |
| Text with commas | In double quotes (`"..."`) |
| Dual weight | Separate KG and LBS lines in snapshot and group totals |
| Tr.Err | Appears literally in Gross/Net columns when there is no valid reading |
| Dates | `yyyy-MM-dd HH:mm` or `yyyy-MM-dd HH:mm:ss` depending on export |

---

## Appendix C — Contact and support

### C.1 Before contacting support

Gather this information:

| Data | Where to find it |
|------|-----------------|
| **App version** | Menu ☰, bottom: e.g. `version-1.5.0` |
| **Device model and OS** | System settings (iPad, Android, iOS/Android version) |
| **Project name** | Monitor header or Projects |
| **Problem description** | Exact on-screen message, screenshot if possible |
| **When it failed** | Connecting PRR, during Zero, in Reports, etc. |

### C.2 Useful materials for support

1. **Project CSV export** (Projects → Export) — current configuration.
2. **Reports CSV/PDF export** — if the issue is historical or past alarms.
3. **Monitor Snapshot** — if the issue is a reading at a specific moment.

### C.3 Manufacturer

**Eilon Engineering**  
Ron Stage Master (EilonRonStage) is Eilon Engineering software for load cell monitoring with a PRR receiver.

For **technical support**, **training**, or **hardware issues** (cells, PRR), contact your **Eilon distributor** or the **support channel** provided with your app installation.

> ℹ️ Keep this manual (`USER_MANUAL.md`) with your installed app version. If you update the application, check whether a manual revision matches the new version.

---

*End of user manual — Ron Stage Master v1.0*
