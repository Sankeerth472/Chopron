# Chopron Greenhouse Autofill

## Install

1. Build the frontend so the helper files exist under `frontend/dist/greenhouse-autofill`.
2. Open your Chromium browser extensions page.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select the `frontend/dist/greenhouse-autofill` folder.
6. Open the extension options page.
7. In Chopron, copy the setup JSON from the Greenhouse Autofill card and paste it into the extension options page.

## Use

1. Visit any Greenhouse application form.
2. Click the floating `Auto-apply` button.
3. Review every answer before submitting.

## Notes

- The helper fills common contact, work authorization, and EEO questions.
- For unusual custom questions, save a `question fragment = answer` override in Chopron.
- The helper can attach the resume currently stored in Chopron if you uploaded the PDF through the dashboard.
