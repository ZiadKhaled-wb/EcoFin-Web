# Selling without internet: what each POS computer needs

EcoFin Pro can keep selling for cash when the internet drops. The sales are saved on the computer and
sent when the connection is back. For this to be safe, each point-of-sale computer must meet the
requirements below.

## Browser

- **Google Chrome or Microsoft Edge**, a recent version, with EcoFin Pro **installed as an app**
  (the install icon in the address bar).
- Not Safari, not Firefox, and never a private or incognito window: they can delete the saved sales.

## One browser profile per POS

- Use **one dedicated browser profile** for each point of sale, used only for EcoFin Pro.
- **Never clear** that profile's browsing data, cookies or site data. The unsent sales live there.

## Computer

- Windows 10 or later, with **automatic time sync** turned on (Settings → Time & language).
- 4 GB of memory at least; 8 GB if the computer also runs other programs.
- About 1 GB of free disk space.

## Printer

- An **80 mm thermal receipt printer** with its Windows driver installed.

## Check before you rely on it

Open the device page on the POS computer (the page where the computer was paired, `/device/pair`).
Under "Offline selling on this computer":

- **Persistent storage** must say **granted**. If it says "not granted", offline selling is off on that
  computer: install the app, use a normal (not private) window, and open the page again.
- **Offline lease** shows until when the computer may sell offline. It is renewed while you are online.

## While offline

- Cash only, walk-in customer, no discounts. Installments, returns and credit wait for the internet.
- Connect again as soon as you can: receipts must reach the tax authority within 24 hours. The banner
  turns red after 18 hours.
- If a computer can't connect again, use **Export unsynced sales** on its device page and give the file
  to a manager, who imports it from **Sales → Offline sales**.
