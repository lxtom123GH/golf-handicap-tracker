# Task 018 before/after copy ledger

Source references and explicit substitutions; repeated uses share a row. The branch diff remains authoritative.

| Source | Before | After |
|---|---|---|
| src/settings-account.js | msg.textContent = '❌ ' + ((e && e.message) \|\| String(e)); | msg.textContent = authErrorMessage(e); |
| src/settings-account.js | 'No email on this account.' | 'This account has no email address. Ask the app administrator for help.' |
| src/ai.js | document.getElementById('ai-error-msg').textContent = \`❌ ${e.message}\`; | document.getElementById('ai-error-msg').textContent = aiErrorMessage(e, 'Could not create the advice. Check your connection, then choose Regenerate to try again.'); |
| src/ui.js | errorEl.textContent = \`Error: ${err.message}\`; | errorEl.textContent = aiErrorMessage(err, 'Could not create your practice plan. Check your connection, then try generating it again.'); |
| src/coach.js | msgEl.textContent = \`❌ ${e.message}\`; | msgEl.textContent = userErrorMessage(e, 'Could not assign the drill. Keep your notes here and try again.'); |
| src/hole-mapper.js | \`save refused: ${err.message \|\| err}\` | userErrorMessage(err, 'Could not save this map. Keep it open, check your connection and try Save again.') |
| src/hole-mapper.js | throw new Error('not signed in') | throw Object.assign(new Error('not signed in'), { code: 'unauthenticated' }) |
| src/oncourse.js | alert(err.message \|\| "Upload failed. Please try again."); | alert("Could not upload the diary. Check your connection, then record it again before uploading."); |
| src/oncourse.js | UI.voiceStatus.textContent = "Error: " + event.error; | UI.voiceStatus.textContent = event.error === 'no-speech'                 ? "No speech was heard. Tap the mic and try speaking again."                 : "Voice input is unavailable. Enter your score with the buttons instead."; |
| src/videos.js | throw new Error('Not signed in.') | throw new InputMessage('Sign in, then choose your video again.') |
| src/videos.js | throw new Error('That file is not a video.') | throw new InputMessage('That file is not a video. Choose a video file, then try again.') |
| src/videos.js | throw new Error(\`Videos are capped | throw new InputMessage(\`Videos are capped |
| src/videos.js | throw new Error(\`This would exceed | throw new InputMessage(\`This would exceed |
| src/videos.js | out.textContent = e.message \|\| 'Analysis failed. Slow-mo clips under ~19 MB work best.'; | out.textContent = aiErrorMessage(e, 'Could not analyse this video. Check your connection, then choose AI analysis again.'); |
| src/videos.js | if (status) status.textContent = e.message \|\| 'Upload failed.'; | if (status) status.textContent = userErrorMessage(e, 'Could not upload this video. Check your connection, then choose Upload video again.'); |
| src/guests.js | throw new Error('A guest needs a name.') | throw new InputMessage('Enter a name for the guest, then try again.') |
| src/guests.js | throw new Error('That name is too long (60 characters max).') | throw new InputMessage('Use a guest name of 60 characters or fewer, then try again.') |
| src/guests.js | throw new Error('Sign in before adding a guest.') | throw new InputMessage('Sign in before adding a guest.') |
| src/modules/event-binders.js | say(err?.message \|\| 'Could not add that guest.'); | say(userErrorMessage(err, 'Could not add that guest. Check your connection, then try Add guest again.')); |
| src/pending-rounds.js | throw new Error('Sign in to approve a card.') | throw new InputMessage('Sign in to approve a card.') |
| src/pending-rounds.js | throw new Error('Nothing to approve.') | throw new InputMessage('No card is selected. Choose a card, then try again.') |
| src/pending-rounds.js | throw new Error('That card is not yours to approve.') | throw new InputMessage('That card belongs to another player. Choose a card addressed to you.') |
| src/pending-rounds.js | alert(err?.message \|\| 'Could not approve that card.'); | alert(userErrorMessage(err, 'Could not finish approving that card. Check your scoring record before trying Approve again.')); |
| index.html | You're offline — scores are saved on this phone and will sync when signal returns. | You're offline. Keep this app open and reconnect to sync. Avoid reloading during your round. |
| index.html | Loading WHS data... | Loading your scoring record… Please wait. |
| index.html | Your Caddy is thinking... | Creating your practice plan… Please wait. |
| index.html | Loading potential regulars... | Loading players you can add… Please wait. |
| index.html | Loading athlete roster... | Loading your players… Please wait. |
| index.html | Loading analytics... | Loading shot patterns… Please wait. |
| index.html | Loading...</p> | Loading people you follow… Please wait.</p> |
| src/coach.js | list.innerHTML = 'Loading...'; | list.innerHTML = '<li>Loading your coaches… Please wait.</li>'; |
| src/coach.js | No coaches added yet. | No coaches added yet. Enter your coach’s email address above to add them. |
| src/coach.js | No athletes are currently linked to your profile. | No players are linked to you yet. Ask a player to add your email address through Manage My Coaches. |
| src/coach.js | 🔄 Syncing athlete roster... | Refreshing your players… Please wait. |
| src/coach.js | Loading drills… | Loading assigned drills… Please wait. |
| src/coach.js | No drills assigned yet. | No drills assigned yet. Use Assign Drill above to set the first one. |
| src/coach.js | Could not load drill impact. | Could not load drill results. Check your connection, then reopen this player. |
| src/coach.js | No notes yet. | No notes yet. Write a note below, then choose Save Note. |
| src/videos.js | Loading videos… | Loading swing videos… Please wait. |
| src/videos.js | Video file unavailable. | This video could not be opened. Check your connection and reopen the library. |
| src/videos.js | Could not delete video. | Could not delete the video. Check your connection, then try Delete again. |
| src/videos.js | Could not load videos. | Could not load videos. Check your connection, then reload when you are not playing a round. |
| src/videos.js | Could not save annotations. | Could not save your drawn lines. Keep this video open and try Save again. |
| src/videos.js | Could not load one of the videos. | Could not load one of the videos. Check your connection, then choose the videos again. |
| src/ai.js | Gemini is analysing your stats... | Analysing your stats… Please wait. You can close this window while you wait. |
| src/ai.js | 'No response received.' | 'No advice was returned. Choose Regenerate to try again.' |
| src/practice.js | No practice records found. | No practice sessions recorded yet. Choose a drill on Practice, then save a session. |
| src/practice.js | yet.</p>\`; | yet. Choose this drill on Practice, then save a session.</p>\`; |
| src/social.js | 'No players found.' | 'No players found. Check the name and try another search.' |
| src/social.js | Loading...</p> | Loading recent activity… Please wait.</p> |
| src/social.js | Error loading activity feed. Please try again later. | Could not load recent activity. Try again later; if it keeps happening, ask the app administrator for help. |
| src/analytics.js | Analyzing shot history... | Analysing shot history… Please wait. |
| src/analytics.js | Failed to load analytics. | Could not load shot patterns. Check your connection, then reopen this player. |
| src/analytics.js | No detailed shot data for this filter. | No detailed shots match these filters. Try All and All time, or record shots in Detailed mode. |
| src/admin.js | Loading users from Firestore... | Loading accounts… Please wait. |
| src/admin.js | Error: Failed to fetch users. | Could not load accounts. Check your connection, then reopen Admin. |
| src/admin.js | emailsList.innerHTML = 'Loading...'; | emailsList.innerHTML = '<tr><td>Loading approved email addresses… Please wait.</td></tr>'; |
| src/admin.js | Failed to update approval status. | Could not update account approval. Reopen Admin to check its current status before trying again. |
| src/admin.js | Failed to update coach role. | Could not update the coach role. Reopen Admin to check its current status before trying again. |
| src/admin.js | Failed to update video quota. | Could not update the video allowance. Reopen Admin to check its current value before trying again. |
| src/ui.js | No players added yet</li> | No players added yet. Choose a player or add a guest above.</li> |
| src/ui.js | Audio Diary could not be loaded. This might be due to a poor network connection or a deleted file. | Could not play this audio diary. Check your connection and try again. If it is still unavailable, ask the app administrator for help. |
| src/ui.js | Could not generate AI briefing. Ensure your internet is connected. | Could not create the AI briefing. Check your connection, then try the briefing button again. |
| src/competitions.js | Could not update the competition. | Could not update the competition. Check your connection, then try again. |
| src/competitions.js | Could not delete the competition. | Could not delete the competition. Check your connection and confirm it is still listed before trying again. |
| src/competitions.js | No custom rules added yet. | No custom rules added yet. Add a rule above, or continue with standard scoring. |
| src/competitions.js | No other approved players to invite yet. | No other approved players are available. Ask the app administrator to approve their accounts, then reopen this list. |
| src/competitions.js | No approved players found. | No approved players found. Ask the app administrator to approve the players, then reopen this list. |
| src/modules/insights-render.js | Could not load shot history. | Could not load shot history. Check your connection, then reopen Insights. |
| src/modules/event-binders.js | Could not load your guests. | Could not load your guests. Check your connection, then reopen Settings. |
| src/app-v4.js | No hole data available for this course. | Hole details are unavailable for this course. Choose Manual AGS to enter your adjusted gross score. |
| src/hole-mapper.js | nothing to save: close a ring first | No area is ready to save. Join the last point to the first to close an area, then choose Save. |
| src/hole-mapper.js | Save this trace to your holeTraces | Save the areas drawn on this hole |
| src/hole-mapper.js | saved ${payload.features.features.length} feature(s) — syncs when online | ${payload.features.features.length} map area(s) queued. Reconnect to finish syncing. |
| index.html | <p>No rounds logged yet.</p> | <p>No rounds logged yet. Start a round on On Course, or choose Log a past round.</p> |
| src/videos.js | container.innerHTML = '<p style="color:#94a3b8;">No swing videos yet.</p>'; | container.innerHTML = \`<p style="color:#94a3b8;">${canDelete                 ? 'No swing videos yet. Choose a video above, then select Upload video.'                 : 'No swing videos yet. Ask the player to upload one on their Practice tab.'}</p>\`; |
| index.html | Saved to your official WHS record. | Saved to your scoring record in this app. |
| index.html | You are logging this round to your official WHS profile. | This round is saved in this app. It does not submit a score to Golf Australia. |
| index.html | Log a round to start building your official WHS handicap. | Log a round to start building your handicap estimate in this app. |
| index.html | One bad round can't hurt it | A new score can change which older scores count. |
| index.html | 36 means you played to your handicap. | Nine net pars total 18 points; eighteen net pars total 36 points. |
| index.html | Simplified Daily Handicap formula in introductory copy | Daily Handicap explained for course, tees and round length; check official lookup before competition play. |
| index.html | AGS abbreviation without an expanded definition in this explainer | AGS means adjusted gross score; distinguish it from actual strokes. |
| src/coach.js | Coach-list read rejection leaves Loading displayed | Could not load your coaches. Check your connection, then close and reopen Manage My Coaches. |
| src/admin.js | Approved-email read rejection leaves Loading displayed | Could not load approved email addresses. Check your connection, then reopen Admin. |
| src/oncourse.js | Mic access denied. Tap the mic again to retry. | Mic blocked. Allow it in browser settings, or use the score buttons. |
| src/oncourse.js | Rules engine is currently unavailable. Please check the USGA handbook manually. | AI rules advice is unavailable. Check the Rules of Golf or ask the competition committee. |
| src/oncourse.js | No score data found for analysis. | No scores are available for this analysis. Close this window and check your scoring record. |
| src/modules/hole-plan-card.js | course file failed to load | Could not load this course map. Check your connection, then choose the course again. |
| src/modules/event-binders.js | Could not delete ${name}. | Could not delete ${name}. Reopen Settings to check the list before trying again. |
