const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration de la connexion MySQL
const pool = mysql.createPool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Fonction pour exécuter le script SQL
const initializeDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    const sql = fs.readFileSync(path.join(__dirname, 'db', 'setup.sql'), 'utf8');
    const queries = sql.split(';').filter(query => query.trim() !== '');
    for (const query of queries) {
      await connection.query(query);
    }
    connection.release();
    console.log('Base de données securite2ie_db initialisée avec succès !');
  } catch (err) {
    console.error('Erreur lors de l\'initialisation de la base de données :', err.stack);
  }
};

// Commenter cette ligne pour éviter de recréer les tables déjà créées
// initializeDatabase();

// Route de test
app.get('/', (req, res) => {
  res.send('Backend 2iE est en ligne !');
});

// API pour l'inscription d'un utilisateur
app.post('/api/users/register', async (req, res) => {
  const { nom, prenom, statut, email, password, numero_inscription, uid_badge_rfid, isadmin = false } = req.body;

  // Validation des champs
  if (!nom || !prenom || !email || !password) {
    return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis.' });
  }

  if (!['Étudiant', 'Professeur', 'Stagiaire', 'Travailleur 2iE'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (nom, prenom, statut, email, password, numero_inscription, uid_badge_rfid, isadmin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nom, prenom, statut, email, hashedPassword, numero_inscription || null, uid_badge_rfid || null, isadmin]
    );

    const [rows] = await pool.query(
      'SELECT id, nom, prenom, statut, email, numero_inscription, uid_badge_rfid, etat, isadmin FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ message: 'Utilisateur inscrit avec succès !', user: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email, numéro d\'inscription ou UID badge RFID déjà utilisé.' });
    }
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour la connexion d'un utilisateur
app.post('/api/users/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    if (!user.etat) {
      return res.status(403).json({ error: 'Compte inactif. Contactez un administrateur.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.json({
      message: 'Connexion réussie !',
      token,
      user: { id: user.id, nom: user.nom, prenom: user.prenom, statut: user.statut, isadmin: user.isadmin }
    });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour ajouter une salle
app.post('/api/salles', async (req, res) => {
  const { nom, capacite, nombre_presents, heure_ouverture, heure_fermeture } = req.body;

  if (!nom || !capacite || !heure_ouverture || !heure_fermeture) {
    return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
  }

  if (capacite <= 0) {
    return res.status(400).json({ error: 'La capacité doit être supérieure à 0.' });
  }

  if (nombre_presents !== undefined && (nombre_presents < 0 || nombre_presents > capacite)) {
    return res.status(400).json({ error: 'Le nombre de présents doit être entre 0 et la capacité.' });
  }

  if (heure_fermeture <= heure_ouverture) {
    return res.status(400).json({ error: 'L\'heure de fermeture doit être après l\'heure d\'ouverture.' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO salles (nom, capacite, nombre_presents, heure_ouverture, heure_fermeture) VALUES (?, ?, ?, ?, ?)',
      [nom, capacite, nombre_presents || 0, heure_ouverture, heure_fermeture]
    );

    const [rows] = await pool.query('SELECT * FROM salles WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Salle créée avec succès !', salle: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Nom de salle déjà utilisé.' });
    }
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour récupérer une salle par ID
app.get('/api/salles/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query('SELECT * FROM salles WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Salle non trouvée.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour supprimer une salle par ID
app.delete('/api/salles/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query('DELETE FROM salles WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Salle non trouvée.' });
    }
    res.json({ message: 'Salle supprimée avec succès !' });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour soumettre une demande d'accès à une salle
app.post('/api/demande-acces', async (req, res) => {
  console.log('Received request body:', req.body); // Debug log
  const { user_id, salle_id, date, heure_debut, heure_fin, motif } = req.body;

  if (!user_id || !salle_id || !date || !heure_debut || !heure_fin || !motif) {
    return res.status(400).json({ error: 'Tous les champs (user_id, salle_id, date, heure_debut, heure_fin, motif) sont obligatoires.' });
  }

  // Validation de la date
  const requestDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (requestDate < today) {
    return res.status(400).json({ error: 'La date ne peut pas être antérieure à aujourd\'hui.' });
  }

  // Validation des heures
  if (heure_fin <= heure_debut) {
    return res.status(400).json({ error: 'L\'heure de fin doit être après l\'heure de début.' });
  }

  try {
    // Vérifier l'utilisateur
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [user_id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    // Vérifier la salle
    const [salles] = await pool.query('SELECT * FROM salles WHERE id = ?', [salle_id]);
    if (salles.length === 0) {
      return res.status(404).json({ error: 'Salle non trouvée.' });
    }

    // Vérifier les horaires de la salle
    const salle = salles[0];
    if (heure_debut < salle.heure_ouverture || heure_fin > salle.heure_fermeture) {
      return res.status(400).json({ error: `La salle est disponible de ${salle.heure_ouverture} à ${salle.heure_fermeture}.` });
    }

    // Vérifier les demandes existantes en attente pour la même salle, date et créneau horaire
    const [existing] = await pool.query(
      'SELECT * FROM demande_acces WHERE user_id = ? AND salle_id = ? AND date = ? AND statut_demande = "en_attente" AND ((heure_debut <= ? AND heure_fin >= ?) OR (heure_debut <= ? AND heure_fin >= ?))',
      [user_id, salle_id, date, heure_debut, heure_debut, heure_fin, heure_fin]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Une demande en attente existe déjà pour cet utilisateur, cette salle, cette date et ce créneau horaire.' });
    }

    // Insérer la demande
    const [result] = await pool.query(
      'INSERT INTO demande_acces (user_id, salle_id, statut_demande, date, heure_debut, heure_fin, motif) VALUES (?, ?, "en_attente", ?, ?, ?, ?)',
      [user_id, salle_id, date, heure_debut, heure_fin, motif]
    );

    const [rows] = await pool.query('SELECT * FROM demande_acces WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Demande d\'accès soumise avec succès !', demande: rows[0] });
  } catch (err) {
    console.error('Database error:', err); // Debug log
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour approuver une demande d'accès
app.patch('/api/demande-acces/:id/approuver', async (req, res) => {
  const { id } = req.params;

  try {
    const [demandes] = await pool.query('SELECT * FROM demande_acces WHERE id = ?', [id]);
    if (demandes.length === 0) {
      return res.status(404).json({ error: 'Demande non trouvée.' });
    }

    const demande = demandes[0];
    if (demande.statut_demande !== 'en_attente') {
      return res.status(400).json({ error: 'La demande n\'est plus en attente.' });
    }

    await pool.query('UPDATE demande_acces SET statut_demande = "approuvee" WHERE id = ?', [id]);

    const [updated] = await pool.query('SELECT * FROM demande_acces WHERE id = ?', [id]);
    res.json({ message: 'Demande approuvée avec succès !', demande: updated[0] });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour rejeter une demande d'accès
app.patch('/api/demande-acces/:id/rejeter', async (req, res) => {
  const { id } = req.params;

  try {
    const [demandes] = await pool.query('SELECT * FROM demande_acces WHERE id = ?', [id]);
    if (demandes.length === 0) {
      return res.status(404).json({ error: 'Demande non trouvée.' });
    }

    const demande = demandes[0];
    if (demande.statut_demande !== 'en_attente') {
      return res.status(400).json({ error: 'La demande n\'est plus en attente.' });
    }

    await pool.query('UPDATE demande_acces SET statut_demande = "rejetee" WHERE id = ?', [id]);

    const [updated] = await pool.query('SELECT * FROM demande_acces WHERE id = ?', [id]);
    res.json({ message: 'Demande rejetée avec succès !', demande: updated[0] });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour consulter une demande d'accès par user_id
app.get('/api/demande-acces/user/:user_id', async (req, res) => {
  const { user_id } = req.params;

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [user_id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    const [demandes] = await pool.query(
      'SELECT * FROM demande_acces WHERE user_id = ? ORDER BY created_at DESC',
      [user_id]
    );

    if (demandes.length === 0) {
      return res.status(404).json({ error: 'Aucune demande trouvée pour cet utilisateur.' });
    }

    res.json({ message: 'Demandes récupérées avec succès !', demandes });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour récupérer tous les utilisateurs
app.get('/api/users', async (req, res) => {
  const { admin } = req.query;
  try {
    const query = admin === 'true'
      ? 'SELECT id, nom, prenom, statut, email, numero_inscription, uid_badge_rfid, etat, isadmin FROM users WHERE isadmin = TRUE'
      : 'SELECT id, nom, prenom, statut, email, numero_inscription, uid_badge_rfid, etat, isadmin FROM users';
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour récupérer un utilisateur par ID
app.get('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT id, nom, prenom, statut, email, numero_inscription, uid_badge_rfid, etat, isadmin FROM users WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour mettre à jour l'état, le statut admin, numero_inscription ou uid_badge_rfid d'un utilisateur
app.patch('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { etat, isadmin, numero_inscription, uid_badge_rfid } = req.body;
  try {
    const updates = {};
    if (etat !== undefined) updates.etat = etat;
    if (isadmin !== undefined) updates.isadmin = isadmin;
    if (numero_inscription !== undefined) updates.numero_inscription = numero_inscription;
    if (uid_badge_rfid !== undefined) updates.uid_badge_rfid = uid_badge_rfid;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune mise à jour fournie.' });
    }
    const [result] = await pool.query('UPDATE users SET ? WHERE id = ?', [updates, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }
    const [updated] = await pool.query(
      'SELECT id, nom, prenom, statut, email, numero_inscription, uid_badge_rfid, etat, isadmin FROM users WHERE id = ?',
      [id]
    );
    res.json({ message: 'Utilisateur mis à jour avec succès !', user: updated[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Numéro d\'inscription ou UID badge RFID déjà utilisé.' });
    }
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour récupérer toutes les demandes d'accès
app.get('/api/demande-acces', async (req, res) => {
  const { statut } = req.query;
  try {
    const query = statut
      ? 'SELECT * FROM demande_acces WHERE statut_demande = ?'
      : 'SELECT * FROM demande_acces WHERE statut_demande = "en_attente"';
    const [rows] = await pool.query(query, statut ? [statut] : []);
    res.json({ demandes: rows });
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour récupérer toutes les salles
app.get('/api/salles', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM salles');
    res.json(rows);
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour le taux d'occupation par mois
app.get('/api/statistiques/taux-occupation', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE_FORMAT(date, '%b') AS mois,
        AVG(s.nombre_presents / s.capacite * 100) AS tauxOccupation
      FROM demande_acces da
      JOIN salles s ON da.salle_id = s.id
      WHERE da.statut_demande = 'approuvee'
      GROUP BY DATE_FORMAT(date, '%b')
      ORDER BY MIN(date)
    `);
    res.json(rows);
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// API pour l'utilisation des salles par jour de la semaine
app.get('/api/statistiques/utilisation-par-jour', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DAYNAME(date) AS jour,
        COUNT(*) AS reservations
      FROM demande_acces
      WHERE statut_demande = 'approuvee'
      GROUP BY jour
      ORDER BY FIELD(DAYNAME(date), 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
    `);
    const jours = [
      { jour: 'Lundi', reservations: 0 },
      { jour: 'Mardi', reservations: 0 },
      { jour: 'Mercredi', reservations: 0 },
      { jour: 'Jeudi', reservations: 0 },
      { jour: 'Vendredi', reservations: 0 },
      { jour: 'Samedi', reservations: 0 },
      { jour: 'Dimanche', reservations: 0 }
    ];
    rows.forEach(row => {
      const index = jours.findIndex(j => j.jour === row.jour);
      if (index !== -1) jours[index].reservations = row.reservations;
    });
    res.json(jours);
  } catch (err) {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Lancer le serveur
app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});