# Google Sheets Integration Guide

This guide explains how to connect a Google Sheet to your Store in the Operations Dashboard to enable automatic order synchronization.

## Prerequisites
- A Google Cloud Platform (GCP) Account.
- A Google Sheet containing your order data.

## Step 1: Setup Google Cloud Service Account

1.  **Go to Google Cloud Console**: [console.cloud.google.com](https://console.cloud.google.com/).
2.  **Create a Project**: Click the project dropdown (top left) > **New Project**. Name it (e.g., "COD Logistics") and create it.
3.  **Enable Sheets API**:
    *   Go to **APIs & Services** > **Library**.
    *   Search for "Google Sheets API".
    *   Click **Enable**.
4.  **Create Service Account**:
    *   Go to **APIs & Services** > **Credentials**.
    *   Click **+ Create Credentials** > **Service Account**.
    *   Name it (e.g., "sheets-sync").
    *   Click **Create and Continue** (Role is optional, "Editor" is easiest, or skip).
    *   Click **Done**.
5.  **Generate Keys**:
    *   Click on the newly created Service Account email (e.g., `sheets-sync@....iam.gserviceaccount.com`).
    *   Go to the **Keys** tab.
    *   Click **Add Key** > **Create new key**.
    *   Select **JSON** and click **Create**.
    *   A `.json` file will download. **Keep this safe!** It contains your credentials.

## Step 2: Prepare Your Google Sheet

1.  **Create/Open Sheet**: Open the Google Sheet where your orders are managed.
2.  **Get Spreadsheet ID**:
    *   Look at the URL: `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjGMUWqTGk/edit`
    *   The ID is the long string between `/d/` and `/edit`.
    *   Example ID: `1BxiMVs0XRA5nFMdKvBdBZjGMUWqTGk`
3.  **Share the Sheet**:
    *   Open the JSON key file you downloaded in Step 1.
    *   Find the `client_email` field.
    *   In your Google Sheet, click **Share** (top right).
    *   Paste the `client_email` and ensure "Editor" or "Viewer" is selected.
    *   Click **Send**.

## Step 3: Connect in Dashboard

1.  **Log in** to your Operations Dashboard.
2.  **Navigate to Settings**: Click **Settings** in the sidebar.
3.  **Add/Edit Store**:
    *   Click **Connect New Store** (or Edit an existing one).
4.  **Fill Credentials** (using data from your JSON key file):
    *   **Project ID**: Copy `project_id` from JSON.
    *   **Client Email**: Copy `client_email` from JSON.
    *   **Private Key**: Copy `private_key` from JSON. *(Include the `-----BEGIN PRIVATE KEY-----` and `-----END...` parts)*.
    *   **Spreadsheet ID**: Paste the ID from Step 2.
    *   **Sheet / Tab Name**: Enter the exact name of the tab (e.g., "Sheet1" or "Orders").
5.  **Test Connection**:
    *   Click **Test Connection**.
    *   If successful, click **Save Changes**.

## Step 4: Sync Data

1.  After saving, finding your store in the list.
2.  Click the **Menu (⋮)** button on the store card.
3.  Click **Sync Now**.
4.  The system will pull orders, map columns, and update your dashboard.

## Column Mapping Reference
The system automatically maps columns based on headers. Ensure your sheet has headers like:
- `Order ID` (Required)
- `Phone` (Required)
- `Customer Name`
- `Address`
- `City`
- `Product Name`
- `Qty`
- `Price`
- `Status`
