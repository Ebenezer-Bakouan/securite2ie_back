-- Active: 1742575561946@@127.0.0.1@3306@mysql
CREATE DATABASE securite2ie_db;
USE securite2ie_db;

-- Créer la table salles
CREATE TABLE salles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(50) UNIQUE NOT NULL,
    capacite INT NOT NULL,
    nombre_presents INT DEFAULT 0,
    heure_ouverture TIME NOT NULL,
    heure_fermeture TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Créer la table users (avec isadmin)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    statut VARCHAR(50) NOT NULL CHECK (statut IN ('Étudiant', 'Professeur', 'Stagiaire', 'Admin 2IE')),
    email VARCHAR(255) UNIQUE NOT NULL, -- Remplace numero_inscription par email
    password VARCHAR(255) NOT NULL,
    etat BOOLEAN NOT NULL DEFAULT TRUE,
    isadmin BOOLEAN NOT NULL DEFAULT FALSE, -- Nouvelle colonne pour administrateur
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);




-- Modifiez la table users si nécessaire
ALTER TABLE users 
MODIFY COLUMN statut VARCHAR(50) NOT NULL 
CHECK (statut IN ('Étudiant', 'Professeur', 'Stagiaire', 'Travailleur 2iE'));

ALTER TABLE users
ADD COLUMN numero_inscription VARCHAR(50) UNIQUE,
ADD COLUMN uid_badge_rfid VARCHAR(50) UNIQUE;

CREATE TABLE demande_acces (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    salle_id INT NOT NULL,
    statut_demande ENUM('en_attente', 'approuvee', 'rejetee') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date DATE NOT NULL,
    heure_debut TIME NOT NULL,
    heure_fin TIME NOT NULL,
    motif TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (salle_id) REFERENCES salles(id) ON DELETE CASCADE
);