# i18n Audit Report

Generated: 2026-10-22T13:46:06.689Z

Scanned 166 frontend TypeScript files.

## Summary

| Category | Count |
| --- | --- |
| Hardcoded user-visible strings | 5 |
| Keys used but missing from English | 0 |
| Keys used but missing explicit Spanish translation | 0 |
| English keys defined but unused | 236 |
| Dynamic translation calls requiring review | 23 |
| Duplicate key definitions | 0 |
| Duplicate translation value groups | 159 |

## 1. Hardcoded User-Visible Strings

| File | Line | Text | Context |
| --- | --- | --- | --- |
| components/grid/SolveOverlay.tsx | 9807 | \`Ã—\` | JSX text |
| components/layout/TimeRangesPanel.tsx | 547 | \`â€”\` | JSX expression |
| lib/api-base.ts | 4 | \`Missing API base URL. Set NEXT_PUBLIC_API_URL.\` | error message |
| lib/cell-api.ts | 5 | \`Missing {...}.\` | error message |
| lib/cell-api.ts | 9 | \`Missing {...}.\` | error message |

## 2. Missing EN Keys

_None._

## 3. Missing ES Keys

These keys currently resolve through `...EN_US`; they do not have an explicit Spanish translation.

_None._

## 4. Unused Keys

| Key | English value | Defined at |
| --- | --- | --- |
| add_participant.custom_requires_override | Custom mode requires at least one weekly override. | lib/i18n.ts:1042 |
| add_participant.weekly_mode | Weekly hours mode | lib/i18n.ts:1036 |
| add_participant.weekly_mode_custom | Custom | lib/i18n.ts:1038 |
| add_participant.weekly_mode_default | Default | lib/i18n.ts:1037 |
| add_participant.weekly_mode_not_available | Not available | lib/i18n.ts:1039 |
| add_rule.cancel | Cancel | lib/i18n.ts:1013 |
| add_rule.error_could_not_create | Could not create rule. | lib/i18n.ts:1009 |
| add_rule.error_could_not_merge | Could not merge with adjacent rule. | lib/i18n.ts:1010 |
| add_rule.error_creating_with_status | Error creating rule ({status}) | lib/i18n.ts:1008 |
| auth.error.account_inactive | This account is not active yet. Verify your email or contact support if this looks wrong. | lib/i18n.ts:81 |
| auth.error.email_exists | An account already exists with this email. Try logging in or reset your password. | lib/i18n.ts:82 |
| auth.error.email_invalid | Enter a valid email address. | lib/i18n.ts:83 |
| auth.error.invalid_credentials | We could not sign you in. Check your email and password, then try again. | lib/i18n.ts:80 |
| auth.error.password_numeric | Choose a stronger password. It cannot be only numbers. | lib/i18n.ts:86 |
| auth.error.password_too_common | Choose a stronger password. This one is too common. | lib/i18n.ts:85 |
| auth.error.password_too_short | Use a longer password. It must meet the minimum length requirement. | lib/i18n.ts:84 |
| auth.error.required_fields | Complete the required fields and try again. | lib/i18n.ts:88 |
| auth.registration_failed | Registration failed | lib/i18n.ts:104 |
| availability_rule.end_must_be_later_than_start | End time must be later than start time. | lib/i18n.ts:991 |
| availability_rule.overlap_message | This rule overlaps another rule on the same day. Try moving or resizing it. | lib/i18n.ts:992 |
| availability_rule.required_fields_message | Please complete all required rule fields. | lib/i18n.ts:995 |
| availability_rule.within_grid_range_message | The rule must stay inside the grid time range. | lib/i18n.ts:994 |
| category_panel.no_participants_found | No categories found. | lib/i18n.ts:52 |
| common.end | End | lib/i18n.ts:14 |
| common.english | English | lib/i18n.ts:8 |
| common.settings | Settings | lib/i18n.ts:19 |
| common.spanish | Spanish | lib/i18n.ts:9 |
| common.start | Start | lib/i18n.ts:13 |
| create_cell.days_count_hint | Between 2 and {max} days. | lib/i18n.ts:1143 |
| create_cell.division_days | Division in days | lib/i18n.ts:1139 |
| create_cell.next_step | Next step | lib/i18n.ts:1162 |
| create_cell.previous_step | Previous step | lib/i18n.ts:1161 |
| create_cell.quantity | Quantity | lib/i18n.ts:1136 |
| create_cell.split_preview | Day {day}: {cells} cells ({minutes} min) | lib/i18n.ts:1159 |
| create_cell.unit_mode_global_label | Global unit mode | lib/i18n.ts:1148 |
| create_cell.unit_mode_global_value_and | AND | lib/i18n.ts:1149 |
| create_cell.unit_mode_global_value_or | OR | lib/i18n.ts:1150 |
| create_cell.unit_mode_override | Override global unit mode | lib/i18n.ts:1151 |
| create_cell.unit_mode_override_help_and | Global mode is AND. Turning this on uses OR for this cell. | lib/i18n.ts:1152 |
| create_cell.unit_mode_override_help_or | Global mode is OR. Turning this on uses AND for this cell. | lib/i18n.ts:1154 |
| editor_invite.failed_load_current_user | Could not load current user. | lib/i18n.ts:1095 |
| entity.bundle | Bundle | lib/i18n.ts:32 |
| entity.category | Category | lib/i18n.ts:38 |
| entity.cell | Cell | lib/i18n.ts:40 |
| entity.grid | Grid | lib/i18n.ts:34 |
| entity.schedule | Schedule | lib/i18n.ts:35 |
| entity.staff | Staff | lib/i18n.ts:33 |
| entity.unit | Unit | lib/i18n.ts:31 |
| format.grid_with_id | Grid {id} | lib/i18n.ts:68 |
| format.staff_with_id | Staff {id} | lib/i18n.ts:64 |
| grid_actions.delete_failed | Failed to delete grid ({status}). {details} | lib/i18n.ts:170 |
| grid_actions.delete_failed_status | Failed to delete grid ({status}). | lib/i18n.ts:1322 |
| grid_actions.delete_protected | The grid could not be deleted because it still has related data. | lib/i18n.ts:1321 |
| grid_actions.time_ranges | Time Ranges | lib/i18n.ts:161 |
| grid_new.cell_size_validation_error | Cell size must be at least 30 and a multiple of 5. | lib/i18n.ts:427 |
| grid_new.create_grid | Create Grid | lib/i18n.ts:434 |
| grid_new.creating | Creating... | lib/i18n.ts:433 |
| grid_new.description | Description | lib/i18n.ts:421 |
| grid_new.title | Create New Grid | lib/i18n.ts:419 |
| grid_overview.categories | Categories | lib/i18n.ts:732 |
| grid_overview.cells | Cells | lib/i18n.ts:731 |
| grid_overview.participants | Participants | lib/i18n.ts:730 |
| grid_overview.time_ranges | Time Ranges | lib/i18n.ts:733 |
| grid_schedule.could_not_load_published_status | Could not load published schedule ({status}) | lib/i18n.ts:1323 |
| grid_schedule.drop_to_remove_participant | Drop here to remove this participant from the placement | lib/i18n.ts:203 |
| grid_schedule.loading_participants | Loading participants... | lib/i18n.ts:179 |
| grid_schedule.move_card_left | Move card left | lib/i18n.ts:188 |
| grid_schedule.move_card_right | Move card right | lib/i18n.ts:189 |
| grid_schedule.my_participant_missing | Your participant profile was not found in this grid. | lib/i18n.ts:181 |
| grid_schedule.no_participants_found | No participants found for this grid. | lib/i18n.ts:180 |
| grid_schedule.no_tier | No tier | lib/i18n.ts:184 |
| grid_schedule.placed_cards_same_row_error | Placed cards can only be moved inside the same participant row. | lib/i18n.ts:193 |
| grid_settings.availability_costs_help | Prioritize penalties for non-preferred and impossible slots. | lib/i18n.ts:813 |
| grid_settings.availability_costs_section | Availability Cost Prioritization | lib/i18n.ts:812 |
| grid_settings.close_sections | Close sections | lib/i18n.ts:839 |
| grid_settings.constraints_section | Constraints | lib/i18n.ts:799 |
| grid_settings.day_heatmap | Day Heatmap | lib/i18n.ts:818 |
| grid_settings.impossible_priority | Impossible slots priority | lib/i18n.ts:816 |
| grid_settings.impossible_priority_help | Maps to impossible_cost (default 10000). | lib/i18n.ts:817 |
| grid_settings.lexicographic_availability | Lexicographic availability | lib/i18n.ts:808 |
| grid_settings.lexicographic_availability_help | Maps to lexicographic_availability. | lib/i18n.ts:809 |
| grid_settings.non_preferred_priority | Non-preferred slots priority | lib/i18n.ts:814 |
| grid_settings.non_preferred_priority_help | Maps to non_preferred_cost (default 100). | lib/i18n.ts:815 |
| grid_settings.p1_help | Maps to weight_availability (30-150). | lib/i18n.ts:790 |
| grid_settings.p10_help | Adjusts weight_participant_day_spread and weight_participant_days. | lib/i18n.ts:797 |
| grid_settings.p11_help | Maps to weight_participant_workload_equity (0-10). | lib/i18n.ts:798 |
| grid_settings.p2_help | Maps to weight_participant_gap (1-20). | lib/i18n.ts:791 |
| grid_settings.p3_help | Maps to weight_participant_days (0.5-10). | lib/i18n.ts:792 |
| grid_settings.p4_help | Maps to weight_unit_gap (1-15). | lib/i18n.ts:793 |
| grid_settings.p5_help | Maps to weight_unit_days (0.5-8). | lib/i18n.ts:794 |
| grid_settings.p6_help | Maps to weight_soft_window (0.2-5). | lib/i18n.ts:795 |
| grid_settings.p9_help | Maps to weight_participant_daily_load_balance (0.5-8). | lib/i18n.ts:796 |
| grid_settings.participants_tab | Participants | lib/i18n.ts:759 |
| grid_settings.prevent_overlap | Prevent overlap for same unit | lib/i18n.ts:800 |
| grid_settings.prevent_overlap_help | Maps to unit_nooverlap_enabled. | lib/i18n.ts:801 |
| grid_settings.principal_tab | Principal | lib/i18n.ts:757 |
| grid_settings.priorities_help | Tune solver priorities from low (1) to high (10). | lib/i18n.ts:789 |
| grid_settings.priorities_section | Priorities | lib/i18n.ts:788 |
| grid_settings.save_units | Save unit constraints | lib/i18n.ts:822 |
| grid_settings.schedule_section | Schedule | lib/i18n.ts:820 |
| grid_settings.soft_window_base_cost | Soft window base cost | lib/i18n.ts:806 |
| grid_settings.soft_window_base_cost_help | Maps to soft_window_base_cost (default 500). | lib/i18n.ts:807 |
| grid_settings.soft_window_enabled | Soft window enabled | lib/i18n.ts:804 |
| grid_settings.soft_window_enabled_help | Maps to soft_window_enabled. | lib/i18n.ts:805 |
| grid_settings.stability_weight | Stability weight | lib/i18n.ts:810 |
| grid_settings.stability_weight_help | Maps to stability_weight (0-100). | lib/i18n.ts:811 |
| grid_settings.unit_constraints | Unit Constraints | lib/i18n.ts:821 |
| grid_settings.unit_max_hours_day | Unit max hours per day | lib/i18n.ts:802 |
| grid_settings.unit_max_hours_day_help | Maps to unit_max_hours_day. | lib/i18n.ts:803 |
| grid_solver_settings.enabled | Enabled | lib/i18n.ts:941 |
| grid_solver_settings.heatmap_budget_ok | Heatmap budget usage: {used} upgrade points used out of {max} for {days} enabled days. | lib/i18n.ts:949 |
| grid_solver_settings.max_hours_day_title | Max hours per day by tier | lib/i18n.ts:922 |
| grid_solver_settings.max_hours_week_title | Max hours per week by tier | lib/i18n.ts:924 |
| grid_solver_settings.min_hours_shortfall_weight_title | Min weekly shortfall penalty weight | lib/i18n.ts:931 |
| grid_solver_settings.min_hours_week_hard_title | Minimum weekly hours are hard | lib/i18n.ts:928 |
| grid_solver_settings.min_hours_week_title | Min hours per week by tier | lib/i18n.ts:926 |
| grid_solver_settings.min_rest_hours_title | Minimum rest hours | lib/i18n.ts:936 |
| grid_solver_settings.payload_preview | Payload Preview | lib/i18n.ts:942 |
| grid_solver_settings.placeholder_example_8 | e.g. 8 | lib/i18n.ts:943 |
| grid_solver_settings.prevent_overlap_help | If enabled, cells sharing the same unit cannot be scheduled at the same time. | lib/i18n.ts:920 |
| grid_solver_settings.prevent_overlap_title | Prevent overlap for same unit | lib/i18n.ts:919 |
| grid_solver_settings.runtime_options | Runtime solver options. Only enabled and fully configured fields are sent in solver_params. | lib/i18n.ts:917 |
| grid_solver_settings.stability_weight_help | 0..100. Higher values keep schedules closer to the previous solution. | lib/i18n.ts:939 |
| grid_solver_settings.stability_weight_title | Stability weight | lib/i18n.ts:938 |
| grid_solver_settings.time_ranges_help | Manage time ranges here. Each range uses a 2-knob slider over the full schedule horizon. | lib/i18n.ts:954 |
| grid_solver_settings.time_ranges_horizon | Horizon: {start} to {end} | lib/i18n.ts:956 |
| grid_solver_settings.title | Settings | lib/i18n.ts:887 |
| grid_solver_settings.unit_max_hours_day_help | Hard daily cap per unit. | lib/i18n.ts:935 |
| grid_solver_settings.unit_max_hours_day_title | Unit max hours per day | lib/i18n.ts:934 |
| onboarding.add_participant | Add Participant | lib/i18n.ts:451 |
| onboarding.add_time_range | Add Time Range | lib/i18n.ts:452 |
| onboarding.blockage_step_description | Optionally, block time slots where no activities should be scheduled. Open the right dock tools and choose blockage. | lib/i18n.ts:521 |
| onboarding.category_step_description | Optionally, create categories and values to generate unit tabs for your schedule. | lib/i18n.ts:488 |
| onboarding.category_step_unit_hint_audience | You chose group-based units; category values become the group tabs in your schedule. | lib/i18n.ts:490 |
| onboarding.category_step_unit_hint_internal | You chose internal units; category values can represent areas, teams or departments. | lib/i18n.ts:494 |
| onboarding.category_step_unit_hint_none | You chose no units; skip this unless you want unit tabs later. | lib/i18n.ts:496 |
| onboarding.category_step_unit_hint_space | You chose space-based units; category values can represent rooms, courts, desks or other spaces. | lib/i18n.ts:492 |
| onboarding.create_cell | Create Cell | lib/i18n.ts:458 |
| onboarding.finish | Finish | lib/i18n.ts:464 |
| onboarding.got_it | Got it | lib/i18n.ts:461 |
| onboarding.later | Later | lib/i18n.ts:459 |
| onboarding.participant_step_description | Create at least one participant before creating cells. | lib/i18n.ts:472 |
| onboarding.skip_for_now | Skip for now | lib/i18n.ts:457 |
| onboarding.step_1_description | Participants are the people who will be assigned to cells in your schedule. You need at least one before creating cells. | lib/i18n.ts:437 |
| onboarding.step_1_title | Add your first participant | lib/i18n.ts:436 |
| onboarding.step_2_description | Time ranges let you restrict when certain cells can be scheduled (for example, Morning or Afternoon). You can set them later from the Time Ranges panel in the left dock. | lib/i18n.ts:440 |
| onboarding.step_2_title | Define time ranges | lib/i18n.ts:439 |
| onboarding.step_3_description | Blockages prevent the solver from placing cells in specific time slots. You can add them later using the blockage tool on the right dock. | lib/i18n.ts:443 |
| onboarding.step_3_title | Block unavailable times | lib/i18n.ts:442 |
| onboarding.step_4_description | Cells are the activities or shifts to be scheduled. Each cell needs at least one eligible participant. | lib/i18n.ts:446 |
| onboarding.step_4_title | Create your first cell | lib/i18n.ts:445 |
| onboarding.step_5_description | You can now run the solver from the lightbulb button on the right. To fine-tune solver objectives and constraints, go to Settings. | lib/i18n.ts:449 |
| onboarding.step_5_title | You're all set! | lib/i18n.ts:448 |
| onboarding.time_range_create_failed | Could not create time range. | lib/i18n.ts:454 |
| onboarding.time_range_created | Time range created. | lib/i18n.ts:455 |
| onboarding.time_range_name_required | Time range name is required. | lib/i18n.ts:453 |
| onboarding.time_range_step_description | Optionally, define time ranges to constrain when cells can be placed. | lib/i18n.ts:511 |
| onboarding.title | Quick setup guide | lib/i18n.ts:435 |
| onboarding.waiting_cell_creation | Current cells: {count}. Create one or skip. | lib/i18n.ts:536 |
| onboarding.waiting_participant_creation | Waiting for participant creation. Current participants: {count}. | lib/i18n.ts:486 |
| onboarding.waiting_time_range_creation | Time ranges created: {count}. | lib/i18n.ts:519 |
| participant_detail.failed_fetch_rules_status | Failed to fetch rules ({status}) | lib/i18n.ts:1297 |
| participant_detail.failed_status | Failed ({status}) | lib/i18n.ts:1295 |
| participants_page.linked_user | Linked user | lib/i18n.ts:1018 |
| schedule.no_published_versions | No published schedule versions are available yet. | lib/i18n.ts:1328 |
| solve_overlay.cannot_place_cell_bundle_unit_occupied | Cannot place this cell there: one of its bundle units is already occupied. | lib/i18n.ts:268 |
| solve_overlay.failed_load_comments_status | Failed to load comments ({status}) | lib/i18n.ts:1341 |
| solve_overlay.loading_blockages | Loading... | lib/i18n.ts:212 |
| solve_overlay.no_valid_participants_for_slot | No valid participants/staff are available at this slot (availability, overlap, or tier constraints). | lib/i18n.ts:299 |
| solve_overlay.open_assignment_first_available | First available participant | lib/i18n.ts:383 |
| solve_overlay.open_assignment_recommended | Recommended from previous assignment | lib/i18n.ts:384 |
| solve_overlay.placement_status_blocked | Blocked | lib/i18n.ts:334 |
| solve_overlay.placement_status_invalid | Invalid | lib/i18n.ts:335 |
| solve_overlay.placement_status_neutral | Valid | lib/i18n.ts:336 |
| solve_overlay.placement_status_recommended | Recommended | lib/i18n.ts:337 |
| solve_overlay.placement_status_warning | Warning | lib/i18n.ts:338 |
| solve_overlay.precheck_blocking_with_counts | Precheck blocking issues: {errors} errors, {warnings} warnings | lib/i18n.ts:368 |
| solve_overlay.precheck_passed | Precheck passed. | lib/i18n.ts:366 |
| solve_overlay.precheck_solver_skipped | Solver skipped because precheck failed. | lib/i18n.ts:365 |
| solve_overlay.precheck_warnings_with_counts | Precheck warnings: {warnings} | lib/i18n.ts:367 |
| solve_overlay.publish | Publish | lib/i18n.ts:255 |
| solve_overlay.publishing | Publishing... | lib/i18n.ts:256 |
| solve_overlay.selected_bundle_has_no_units | Selected bundle has no units. | lib/i18n.ts:352 |
| solve_overlay.staff_assignment_label | Staff: {name} | lib/i18n.ts:378 |
| solve_overlay.tier_pools | Tier pools | lib/i18n.ts:380 |
| solve_overlay.tier_pools_assignment_label | Tier pools: {names} | lib/i18n.ts:381 |
| solve_overlay.tier_pools_recommended | Tier pools (recommended from previous assignment) | lib/i18n.ts:382 |
| solver_wizard.custom_description | Custom description | lib/i18n.ts:561 |
| solver_wizard.custom_description_placeholder | Describe your organization | lib/i18n.ts:562 |
| solver_wizard.day_spread_cluster | Cluster | lib/i18n.ts:692 |
| solver_wizard.day_spread_separate | Separate | lib/i18n.ts:691 |
| solver_wizard.no_preference | No preference | lib/i18n.ts:669 |
| solver_wizard.optional | optional | lib/i18n.ts:567 |
| solver_wizard.other_context_helper | This helps us understand new scheduling use cases and improve the system. | lib/i18n.ts:658 |
| solver_wizard.other_context_placeholder | Example: rotating shifts for a small clinic, music academy schedules, church volunteers... | lib/i18n.ts:655 |
| solver_wizard.priorities_optional | All sliders are optional. Untouched values keep profile defaults. | lib/i18n.ts:568 |
| solver_wizard.priority_availability | Respect participant availability | lib/i18n.ts:680 |
| solver_wizard.priority_daily_load_balance | Daily load balance | lib/i18n.ts:683 |
| solver_wizard.priority_day_spread | Separate vs. cluster days | lib/i18n.ts:684 |
| solver_wizard.priority_participant_days | Concentrate activities in fewer days | lib/i18n.ts:682 |
| solver_wizard.priority_participant_gap | Minimize gaps between participant activities | lib/i18n.ts:681 |
| solver_wizard.priority_participant_workload_equity | Participant workload equity | lib/i18n.ts:688 |
| solver_wizard.priority_participant_workload_equity_desc | Should weekly assigned cells be balanced fairly across comparable participants? | lib/i18n.ts:689 |
| solver_wizard.priority_soft_window | Respect preferred time windows | lib/i18n.ts:687 |
| solver_wizard.priority_unit_days | Concentrate unit activities | lib/i18n.ts:686 |
| solver_wizard.priority_unit_gap | Minimize gaps in units | lib/i18n.ts:685 |
| solver_wizard.q_min_cells | Minimum cells per week by tier | lib/i18n.ts:676 |
| solver_wizard.q_min_cells_invalid | Min cells values must be non-negative integers. | lib/i18n.ts:677 |
| solver_wizard.q_tiers | Tier usage | lib/i18n.ts:672 |
| solver_wizard.q_tiers_disable | Disable tiers | lib/i18n.ts:675 |
| solver_wizard.q_tiers_enable | Enable tiers | lib/i18n.ts:674 |
| solver_wizard.q_tiers_keep | No change | lib/i18n.ts:673 |
| solver_wizard.q1_required | Please select an organization type. | lib/i18n.ts:693 |
| solver_wizard.q4_no | No | lib/i18n.ts:668 |
| solver_wizard.q4_unit_nooverlap | Keep unit placements from overlapping | lib/i18n.ts:666 |
| solver_wizard.q4_yes | Yes | lib/i18n.ts:667 |
| solver_wizard.q5_help | Leave empty or 0 to skip | lib/i18n.ts:671 |
| solver_wizard.q5_min_rest | Minimum rest hours | lib/i18n.ts:670 |
| solver_wizard.section_priorities | Priorities | lib/i18n.ts:565 |
| solver_wizard.section_questions | Questions | lib/i18n.ts:564 |
| solver_wizard.step_x_of_y | Step {step} of {total} | lib/i18n.ts:542 |
| solver_wizard.unit_nature_audience | Audience | lib/i18n.ts:572 |
| solver_wizard.unit_nature_audience_help | Units represent groups that attend together (classes/sections). | lib/i18n.ts:573 |
| solver_wizard.unit_nature_internal | Internal | lib/i18n.ts:575 |
| solver_wizard.unit_nature_internal_group | Internal group | lib/i18n.ts:585 |
| solver_wizard.unit_nature_internal_group_help | Units represent internal organizational divisions. | lib/i18n.ts:586 |
| solver_wizard.unit_nature_internal_help | Units represent internal operational groups. | lib/i18n.ts:576 |
| solver_wizard.unit_nature_none | None | lib/i18n.ts:578 |
| solver_wizard.unit_nature_none_help | No unit-level coupling is needed. | lib/i18n.ts:579 |
| solver_wizard.unit_nature_space | Space | lib/i18n.ts:581 |
| solver_wizard.unit_nature_space_help | Units represent space constraints and spatial separation needs. | lib/i18n.ts:582 |
| solver_wizard.unit_nature_space_help_short | Space-based grouping and conflicts. | lib/i18n.ts:584 |
| solver_wizard.use_default_configuration | Use default configuration | lib/i18n.ts:679 |
| time_ranges.add_new | Add new time range | lib/i18n.ts:173 |
| time_ranges.create_failed | Create failed ({status}) | lib/i18n.ts:175 |
| time_ranges.delete_failed | Delete failed ({status}) | lib/i18n.ts:177 |

## 5. Duplicate Definitions And Values

### Duplicate key definitions

_None._

### Duplicate translation values

| Locale | Value | Keys |
| --- | --- | --- |
| en-US | Add Participant | add_participant.title, onboarding.add_participant |
| en-US | Adding... | add_category.adding, add_participant.adding |
| en-US | Audience | grid_settings.unit_nature_audience, solver_wizard.unit_nature_audience |
| en-US | Availability Rules | landing.availability_rules, participant_detail.availability_rules |
| en-US | Back to | auth.back_to, password_change.back_to |
| en-US | Blocked | solve_overlay.blocked_overlay_label, solve_overlay.placement_status_blocked |
| en-US | Breaks | break_dialog.title, solve_overlay.breaks |
| en-US | Cancel | add_rule.cancel, common.cancel |
| en-US | Categories | category_panel.title, entity.categories, grid_overview.categories, side_dock.categories |
| en-US | Cells | cells.title, entity.cells, grid_overview.cells, side_dock.cells |
| en-US | Close | common.close, invite_dialog.close |
| en-US | Comments | participant_detail.comments, solve_overlay.comments |
| en-US | Constraints | grid_settings.constraints_section, grid_solver_settings.constraints |
| en-US | Could not create time range. | grid_solver_settings.time_ranges_create_failed, onboarding.time_range_create_failed |
| en-US | Could not delete grid. | grid_actions.could_not_delete_grid, grid_settings.delete_grid_failed |
| en-US | Could not remove participant from placement. | grid_schedule.could_not_remove_participant, solve_overlay.could_not_remove_participant |
| en-US | Could not save settings. | grid_settings.save_failed, grid_solver_settings.save_failed |
| en-US | Create Cell | create_cell.title, onboarding.create_cell |
| en-US | Create Grid | grid_new.create_grid, solver_wizard.create_grid |
| en-US | Create New Grid | grid_new.title, solver_wizard.title |
| en-US | Create your first cell | onboarding.cell_step_title, onboarding.step_4_title |
| en-US | Creating... | auth.creating_account, create_cell.creating, grid_new.creating, solver_wizard.creating |
| en-US | Daily load balance | grid_solver_settings.weight_day_load_balance_label, solver_wizard.priority_daily_load_balance |
| en-US | Day Heatmap | grid_settings.day_heatmap, grid_solver_settings.day_heatmap_title |
| en-US | Define time ranges | onboarding.step_2_title, onboarding.time_range_step_title |
| en-US | Delete | category_dialog.delete_value, common.delete |
| en-US | Delete grid | grid_actions.delete_grid, grid_settings.delete_grid_button, grid_settings.delete_grid_confirm_button, grid_settings.delete_grid_section_title |
| en-US | Deleting... | grid_settings.delete_grid_deleting, solve_overlay.action_deleting |
| en-US | Description | create_cell.description, grid_new.description, grid_settings.description |
| en-US | Double click to edit participant | participant_detail.edit_hint, participants_panel.double_click_edit |
| en-US | e.g. 8 | grid_solver_settings.min_rest_placeholder, grid_solver_settings.placeholder_example_8 |
| en-US | Email | auth.email, editor_invite.email |
| en-US | Enabled | common.enabled, grid_solver_settings.enabled |
| en-US | Error creating rule ({status}) | add_rule.error_creating_status, add_rule.error_creating_with_status |
| en-US | Failed ({status}) | errors.failed_status, participant_detail.failed_status |
| en-US | Failed to add value | add_category.failed_add_value, category_dialog.failed_add_value |
| en-US | Finish | common.finish, onboarding.finish |
| en-US | Go to step {step} | common.go_to_step, create_cell.go_to_step, solver_wizard.go_to_step |
| en-US | Grid | entity.grid, grid_settings.context_prefix |
| en-US | Internal | grid_settings.unit_nature_internal, solver_wizard.unit_nature_internal |
| en-US | Last name | add_participant.last_name, auth.last_name |
| en-US | Loading settings... | grid_settings.loading, grid_solver_settings.loading |
| en-US | Loading... | category_dialog.loading, common.loading, invite_dialog.loading, password_change.loading, solve_overlay.loading_blockages |
| en-US | Log in | auth.log_in, invite_token.log_in, verify_email_confirm.log_in |
| en-US | Max hours per day by tier | grid_settings.max_hours_day_by_tier, grid_solver_settings.max_hours_day_title |
| en-US | Max hours per week by tier | grid_settings.max_hours_week_by_tier, grid_solver_settings.max_hours_week_title |
| en-US | Message (optional) | editor_invite.message_optional, invite_dialog.message_optional |
| en-US | Min hours per week by tier | grid_settings.min_hours_week_by_tier, grid_solver_settings.min_hours_week_title |
| en-US | Min weekly shortfall penalty weight | grid_settings.min_hours_week_weight, grid_solver_settings.min_hours_shortfall_weight_title |
| en-US | Minimum rest hours | grid_settings.min_rest_hours, grid_solver_settings.min_rest_hours_title, solver_wizard.q5_min_rest |
| en-US | Minimum weekly hours are hard | grid_settings.min_hours_week_hard, grid_solver_settings.min_hours_week_hard_title |
| en-US | Name | common.name, grid_new.name, grid_settings.name |
| en-US | Name * | add_category.name_required, create_cell.name_required |
| en-US | Name is required. | add_participant.name_required_error, grid_settings.name_required |
| en-US | New password | auth.new_password, password_change.new_password |
| en-US | New value name | add_category.new_value_name, category_dialog.new_value_name |
| en-US | Next | common.next, onboarding.next, solver_wizard.next_step |
| en-US | Next step | common.next_step, create_cell.next_step |
| en-US | No bundle sets saved yet. | create_cell.no_bundle_sets_saved, edit_cell.no_bundle_sets_saved |
| en-US | No categories found. | category_panel.no_categories_found, category_panel.no_participants_found |
| en-US | No values yet | add_category.no_values_yet, category_dialog.no_values_yet |
| en-US | None | grid_settings.unit_nature_none, solver_wizard.unit_nature_none |
| en-US | Not available | add_participant.weekly_mode_not_available, grid_settings.not_available |
| en-US | Owner | invite_dialog.owner, recent_projects.column_owner |
| en-US | Participant workload equity | grid_solver_settings.weight_participant_workload_equity_label, solver_wizard.priority_participant_workload_equity |
| en-US | Participants | entity.participants, grid_overview.participants, grid_settings.participants_tab, side_dock.participants, solve_overlay.participants |
| en-US | Placement | break_dialog.placement, grid_settings.placement_item, solve_overlay.placement |
| en-US | Prevent overlap for same unit | grid_settings.prevent_overlap, grid_solver_settings.prevent_overlap_title |
| en-US | Previous step | common.previous_step, create_cell.previous_step, solver_wizard.previous_step |
| en-US | Priorities | grid_settings.priorities_section, solver_wizard.section_priorities |
| en-US | Recommended | solve_overlay.placement_status_recommended, solve_overlay.recommended |
| en-US | Saved. | grid_settings.saved, grid_solver_settings.saved |
| en-US | Saving... | add_rule.saving, common.saving, solve_overlay.saving |
| en-US | Schedule | entity.schedule, grid_settings.schedule_section, grid_settings.schedule_tab, participant_detail.schedule |
| en-US | Select at least one day. | grid_new.days_required, grid_settings.days_required |
| en-US | Select... | create_cell.select_option, grid_settings.select_option |
| en-US | Sending... | auth.sending, editor_invite.sending, invite_dialog.sending |
| en-US | Settings | common.settings, grid_actions.settings, grid_solver_settings.title |
| en-US | Space | grid_settings.unit_nature_space, solver_wizard.unit_nature_space |
| en-US | Stability weight | grid_settings.stability_weight, grid_solver_settings.stability_weight_title |
| en-US | The grid could not be deleted because it still has related data. | grid_actions.delete_protected, grid_settings.delete_grid_protected |
| en-US | Time range name is required. | grid_solver_settings.time_ranges_name_required, onboarding.time_range_name_required |
| en-US | Time Ranges | entity.time_ranges, grid_actions.time_ranges, grid_overview.time_ranges, grid_solver_settings.time_ranges_title, side_dock.time_ranges |
| en-US | Unit max hours per day | grid_settings.unit_max_hours_day, grid_solver_settings.unit_max_hours_day_title |
| en-US | Update password | auth.update_password, password_change.update_password |
| en-US | Updating... | auth.updating, password_change.updating |
| en-US | Version history | grid_topbar.version_history, solve_overlay.history |
| en-US | What do you want to organize? | solver_wizard.unit_nature_event_question, solver_wizard.unit_nature_gym_question, solver_wizard.unit_nature_private_tutor_question |
| en-US | You're all set! | onboarding.final_step_title, onboarding.step_5_title |
| es-AR | ¿Qué querés organizar? | solver_wizard.unit_nature_event_question, solver_wizard.unit_nature_gym_question, solver_wizard.unit_nature_private_tutor_question |
| es-AR | Actualizando... | auth.updating, password_change.updating |
| es-AR | Actualizar contraseña | auth.update_password, password_change.update_password |
| es-AR | Agregando... | add_category.adding, add_participant.adding |
| es-AR | Agregar participante | add_participant.title, onboarding.add_participant |
| es-AR | Apellido | add_participant.last_name, auth.last_name |
| es-AR | Asignacion | break_dialog.placement, grid_settings.placement_item, solve_overlay.placement |
| es-AR | Audiencia | grid_settings.unit_nature_audience, solver_wizard.unit_nature_audience |
| es-AR | Bloqueado | solve_overlay.blocked_overlay_label, solve_overlay.placement_status_blocked |
| es-AR | Cambiar contraseña | password_change.title, user_menu.change_password |
| es-AR | Cargando... | category_dialog.loading, common.loading, invite_dialog.loading, password_change.loading, solve_overlay.loading_blockages |
| es-AR | Categorias | entity.categories, side_dock.categories |
| es-AR | Celdas | cells.title, entity.cells, side_dock.cells |
| es-AR | Cerrar | common.close, invite_dialog.close |
| es-AR | Comentarios | participant_detail.comments, solve_overlay.comments |
| es-AR | Configuracion | common.settings, grid_actions.settings |
| es-AR | Configuracion de grilla | grid_settings.page_heading, grid_settings.title |
| es-AR | Crea tu primera celda | onboarding.cell_step_title, onboarding.step_4_title |
| es-AR | Creando... | auth.creating_account, create_cell.creating, grid_new.creating, solver_wizard.creating |
| es-AR | Crear celda | create_cell.title, onboarding.create_cell |
| es-AR | Crear grilla | grid_new.create_grid, solver_wizard.create_grid |
| es-AR | Crear nueva grilla | grid_new.title, solver_wizard.title |
| es-AR | Define rangos horarios | onboarding.step_2_title, onboarding.time_range_step_title |
| es-AR | Descripcion | create_cell.description, grid_new.description, grid_settings.description |
| es-AR | El nombre del rango horario es obligatorio. | grid_solver_settings.time_ranges_name_required, onboarding.time_range_name_required |
| es-AR | El nombre es obligatorio. | add_participant.name_required_error, grid_settings.name_required |
| es-AR | Eliminar grilla | grid_actions.delete_grid, grid_settings.delete_grid_button, grid_settings.delete_grid_confirm_button, grid_settings.delete_grid_dialog_title, grid_settings.delete_grid_section_title |
| es-AR | Email | auth.email, editor_invite.email |
| es-AR | Enviando... | auth.sending, editor_invite.sending, invite_dialog.sending, solve_overlay.submitting |
| es-AR | Error ({status}) | errors.failed_status, participant_detail.failed_status |
| es-AR | Espacio | grid_settings.unit_nature_space, solver_wizard.unit_nature_space |
| es-AR | Finalizar | common.finish, onboarding.finish |
| es-AR | Grilla | entity.grid, grid_settings.context_prefix |
| es-AR | Guardando... | add_rule.saving, common.saving, solve_overlay.saving |
| es-AR | Heatmap diario | grid_settings.day_heatmap, grid_solver_settings.day_heatmap_title |
| es-AR | Historial de versiones | grid_topbar.version_history, solve_overlay.history |
| es-AR | Horario | entity.schedule, grid_settings.schedule_section, grid_settings.schedule_tab, participant_detail.schedule |
| es-AR | Iniciar sesión | auth.log_in, invite_token.log_in, nav.log_in, verify_email_confirm.log_in |
| es-AR | Ir al paso {step} | common.go_to_step, create_cell.go_to_step, solver_wizard.go_to_step |
| es-AR | La hora de fin debe ser posterior a la hora de inicio. | add_rule.validation_end_greater_than_start, availability_rule.end_must_be_later_than_start |
| es-AR | Máximo de horas por día según el nivel | grid_settings.max_hours_day_by_tier, grid_solver_settings.max_hours_day_by_tier |
| es-AR | Máximo de horas por semana según el nivel | grid_settings.max_hours_week_by_tier, grid_solver_settings.max_hours_week_by_tier |
| es-AR | Mensaje (opcional) | editor_invite.message_optional, invite_dialog.message_optional |
| es-AR | Mínimo de horas por semana según el nivel | grid_settings.min_hours_week_by_tier, grid_solver_settings.min_hours_week_by_tier |
| es-AR | Naturaleza de unidad | grid_settings.unit_nature, solver_wizard.unit_nature |
| es-AR | Ninguna | grid_settings.unit_nature_none, solver_wizard.unit_nature_none |
| es-AR | No disponible | add_participant.weekly_mode_not_available, grid_settings.not_available |
| es-AR | No hay valores aún | add_category.no_values_yet, category_dialog.no_values_yet |
| es-AR | No se pudo crear el rango horario. | grid_solver_settings.time_ranges_create_failed, onboarding.time_range_create_failed |
| es-AR | No se pudo eliminar la grilla. | grid_actions.could_not_delete_grid, grid_settings.delete_grid_failed |
| es-AR | No se pudo quitar al participante de la asignación. | grid_schedule.could_not_remove_participant, solve_overlay.could_not_remove_participant |
| es-AR | Nombre | auth.first_name, common.name, grid_new.name, grid_settings.name |
| es-AR | Nombre * | add_category.name_required, add_participant.first_name_required, create_cell.name_required |
| es-AR | Nombre de nuevo valor | add_category.new_value_name, category_dialog.new_value_name |
| es-AR | Participantes | entity.participants, grid_settings.participants_tab, side_dock.participants, solve_overlay.participants |
| es-AR | Paso anterior | common.previous_step, create_cell.previous_step, solver_wizard.previous_step |
| es-AR | Principal | grid_settings.main_tab, grid_settings.principal_tab |
| es-AR | Prioridades | grid_settings.priorities_section, solver_wizard.section_priorities |
| es-AR | Rangos horarios | entity.time_ranges, grid_actions.time_ranges, grid_solver_settings.time_ranges_title, side_dock.time_ranges |
| es-AR | Recomendado | solve_overlay.placement_status_recommended, solve_overlay.recommended |
| es-AR | Reglas de disponibilidad | landing.availability_rules, participant_detail.availability_rules |
| es-AR | Restricciones | grid_settings.constraints_section, grid_solver_settings.constraints |
| es-AR | Selecciona al menos un dia. | grid_new.days_required, grid_settings.days_required |
| es-AR | Seleccionar... | create_cell.select_option, grid_settings.select_option |
| es-AR | Siguiente | common.next, onboarding.next, solver_wizard.next_step |
| es-AR | Siguiente paso | common.next_step, create_cell.next_step |
| es-AR | Tipo de organizacion | grid_settings.organization_type, solver_wizard.org_type |
| es-AR | Todavia no hay conjuntos guardados. | create_cell.no_bundle_sets_saved, edit_cell.no_bundle_sets_saved |
| es-AR | Todo listo! | onboarding.final_step_title, onboarding.step_5_title |
| es-AR | Volver | auth.back_to, common.back |

## Dynamic Translation Calls

Dynamic keys cannot be proven present or unused statically and require manual review.

| File | Line | Expression |
| --- | --- | --- |
| app/(site)/dashboard/page.tsx | 9 | key |
| app/grid/[code]/categories/page.tsx | 13 | key |
| app/grid/[code]/cells/page.tsx | 47 | key |
| app/grid/[code]/history/page.tsx | 24 | key |
| app/grid/[code]/page.tsx | 69 | key |
| app/grid/[code]/participants/page.tsx | 141 | key |
| app/grid/[code]/settings/page.tsx | 26 | key |
| app/grid/new/page.tsx | 248 | key as never |
| components/dialogs/cell-staffing.tsx | 309 | key |
| components/dialogs/cell-staffing.tsx | 316 | key |
| components/grid/GridSchedulePanel.tsx | 998 | labelKey |
| components/grid/GridSettingsTabs.tsx | 646 | TIER_LABEL_KEYS[tier] |
| components/grid/GridSettingsTabs.tsx | 870 | key as never |
| components/grid/GridSolverSettingsForm.tsx | 426 | key as never |
| components/grid/GridSolverSettingsForm.tsx | 1193 | TIER_LABEL_KEYS[tier] |
| components/grid/GridSolverSettingsForm.tsx | 1234 | DAY_KEY_TO_I18N[dayKey] |
| components/grid/OnboardingGuide.tsx | 1569 | categoryUnitHintKey as Parameters<typeof t>[0] |
| components/invitations/InvitesMenu.tsx | 744 | statusTag.labelKey |
| components/navigation/GridTopBar.tsx | 31 | key |
| components/navigation/NavBar.tsx | 23 | key |
| components/providers/I18nProvider.tsx | 61 | key |
| components/site/LandingPage.tsx | 25 | key |
| lib/use-i18n.ts | 54 | key |

## Scope And Heuristics

- AST analysis uses the TypeScript compiler API.
- Scans `.ts` and `.tsx` source files while excluding tests, generated output, API proxy routes, scripts, and `lib/i18n.ts`.
- Hardcoded findings cover JSX text/expressions, accessibility and tooltip props, common UI configuration fields, browser dialogs, toasts, UI-message setters, and static `Error` messages.
- Static analysis is intentionally conservative around identifiers, CSS classes, URLs, API paths, and technical literals; review findings before changing UI text.
