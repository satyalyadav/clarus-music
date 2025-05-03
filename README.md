# Music Library Project

A full-stack web application for managing and playing your personal music library.  
Built with React, Node.js, Express, and PostgreSQL.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (v18 or later recommended)
- **PostgreSQL** (v14 or later recommended) — a running PostgreSQL server instance  

---

## Installation

1. **Clone the Repository**  
   ```bash
   git clone <your-repository-url>
   cd <repository-folder-name>
   ```

2. **Install All Dependencies**  
   From the root project directory, run:  
   ```bash
   npm run install:all
   ```
   This will install both backend and frontend dependencies.

3. **Database Setup**  
   This project requires a PostgreSQL database named Music Library.

   - **Start PostgreSQL**  
     Make sure your PostgreSQL server is running.

   - **Create the Database**  
     Connect via psql or your GUI of choice (e.g., pgAdmin) and run:  
     ```sql
     CREATE DATABASE "Music Library";
     ```
     _Note: The quotes are important if your database name contains spaces._

   - **Create Tables**  
     Run the code inside `backend/schema.sql` manually in psql or using the Query Tool in pgAdmin.

4. **Environment Variables**

   - **Backend**  
     In the `backend` folder, create a file named `.env`:  
     ```ini
     # PostgreSQL connection URL (encode space in "Music Library" as %20)
     # The default port is 5432. Check your port and change accordingly.
     # Replace the <user>, <password>, and <host> with your own PostgreSQL credentials.
     DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/Music%20Library

     # IMPORTANT: Change this to a strong, unique secret for JWT
     JWT_SECRET=your-very-strong-and-secret-key-please-change

     # Port the backend server will run on
     PORT=4000
     ```

   - **Frontend**  
     In the `frontend` folder, create a file named `.env`:  
     ```ini
     # URL of the backend API
     VITE_API_URL=http://localhost:4000
     ```

5. **Create Uploads Directory**  
   In the `backend` directory, manually create the folder where uploaded audio files will be stored:  
   ```bash
   Linux/macOS:
   mkdir backend/uploads

   Windows:
   mkdir backend\uploads
   ```
   _Note: This folder is included in the `.gitignore`, so it won't be tracked by Git, but it needs to exist for the application to save uploaded songs._

6. **Running the Application**  
   From the root project directory, simply run:  
   ```bash
   npm run dev
   ```
   This will start both your backend and the frontend development server concurrently.  
   Once everything is up, open your browser and navigate to the URL provided by Vite (e.g., `http://localhost:5173`).  
