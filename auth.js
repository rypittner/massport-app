const { Client, Account, Databases, ID } = Appwrite;

const client = new Client()
    .setEndpoint('https://cloud.appwrite.io/v1') // Your Appwrite Endpoint
    .setProject('YOUR_PROJECT_ID');               // Your Project ID

const account = new Account(client);
const databases = new Databases(client);

// Check for active session
async function checkAuth() {
    try {
        const user = await account.get();
        console.log("Logged in as:", user.email);
        init(); // Start the app if logged in
    } catch (err) {
        // Redirect to login or show login modal
        showLoginUI();
    }
}

async function login(email, password) {
    try {
        await account.createEmailSession(email, password);
        window.location.reload();
    } catch (err) {
        alert("Login failed: " + err.message);
    }
}
