import dayjs from 'dayjs';
import express from 'express';
import joi from 'joi';
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());

/* --------------------- CONECTANDO AO BANCO ---------------------- */

let participants;

let db;
const mongoClient = new MongoClient("mongodb://localhost:27017");

async function findParticipants() {
    try {
        await mongoClient.connect()
        db = mongoClient.db("uol");
        participants = await db.collection("participants").find({}).toArray();
    } catch (error) {
        res.status(500).send('Erro ao conectar o banco de dados')
        console.log(error)
    }
}

/* --------------------- PARTICIPANTS (POST) ---------------------- */

app.post("/participants", async (req, res) => {

    const participant = req.body;

    /* VERIFICAÇÃO - CONTER "NAME" E NÃO ESTAR VAZIO */

    const userSchemaEmpty = joi.object({
        name: joi.string().required(),
    });

    const validationEmpty = userSchemaEmpty.validate(participant);

    if (validationEmpty.error) {
        res.status(422).send("O nome e apenas ele deve ser preenchido");
        return
    }

    /* VERIFICAÇÃO - NÃO SER REPETIDO */

    await findParticipants();
    if (participants.find(e => e.name === participant.name)) {
        res.status(409).send("O nome já existe");
        return
    }

    /* INSERINDO NO BANCO DE DADOS */

    try {
        await db.collection("participants").insertOne({
            name: participant.name, 
            lastStatus: Date.now()
        });

        await db.collection("messages").insertOne({
            from: participant.name, 
            to: 'Todos', 
            text: 'entra na sala...', 
            type: 'status', 
            time: dayjs(Date.now()).format('HH:mm:ss')
        });
        
        res.status(201).send("Participante adicionado com sucesso")
    } catch (error) {
        res.status(500).send('Erro ao adicionar participante no banco de dados')
        console.log(error)
    }

});

/* ---------------------- PARTICIPANTS (GET) ---------------------- */

app.get("/participants", async (req, res) => {
    try {
        await findParticipants();
        res.send(participants);
    } catch (error) {
        res.status(500).send('Erro ao buscar participantes no banco de dados')
        console.log(error)
    }
});

/* ---------------------------------------------------------------- */

app.listen(5000);