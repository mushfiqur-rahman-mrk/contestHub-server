const express = require('express');
const cors = require('cors');
const app=express()
var jwt = require('jsonwebtoken');
require("dotenv").config();
const stripe= require('stripe')(process.env.VITE_PAYEMENT_SECRATE_KEY)
const port = process.env.PORT || 5000

//middleware

app.use(cors())
app.use(express.static('public'))
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bpy2nre.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // :::::::::::::: DB COLLECTIONS :::::::::::::::

    const usersCollection = client.db("contestHub").collection("userDB");
    const contestCollection = client.db("contestHub").collection("contestDB");
    const paymentCollection = client.db("contestHub").collection("paymentDB");
    const pendingContestCollection = client.db("contestHub").collection("pendingContest");

    // ::::::::::::::: JWT RELETED APIS :::::::::::::::::

    app.post('/jwt', async(req,res)=>{
      const user=req.body //payload
      var token = jwt.sign(user, process.env.ACCESS_SECRATE,{expiresIn:'24d'});
      res.send({token})
    })
    // middlewares
    const verifyToken=(req,res,next)=>{
      console.log('insidesss',req.headers);
    if(!req.headers.authorization){
       return res.status(401).send({messege:'unauthorized access'})
      }
      const token=req.headers.authorization.split(' ')[1]
          console.log('tok tok tokennnnnnnn',token);
      jwt.verify(token,process.env.ACCESS_SECRATE, (err,decoded)=>{
        if(err){
           return res.status(401).send({messege:'unauthorized access'})
         }
      req.decoded= decoded;
        next()   
       })   
    }
    const verifyAdmin=async(req,res,next)=>{
      const email= req.decoded.email;
      const query={email: email}
      const user = await usersCollection.findOne(query);
      const isAdmin= user?.role === 'admin'
      if(!isAdmin){
        return res.status(403).send({message:'forbidden access (admin mid)'})
      }
      next()
    }
 

    // ::::::::::::::: PAYMENT METHODS :::::::::::::::::
    app.post('/create-payment-intent', async(req,res)=>{
      const {price}=req.body;
      const amount= parseInt(price * 100)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency:'usd',
        payment_method_types:['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })
    app.post('/payment', async(req,res)=>{
      const payment= req.body;
      const result= await paymentCollection.insertOne(payment)
      console.log('payment info ', payment);
      res.send(result)
    })
    app.get('/payment', async(req,res)=>{
      try{
        const result = await paymentCollection.find().toArray()
        res.send(result)
      }catch(error){
        console.log(error);
      }
      
    })
    app.get('/payment/:email', async(req,res)=>{
      const email= req.params.email
      const query={creatorEmail:email}
      const result= await paymentCollection.find(query).toArray()
      res.send(result)
    })
    app.get('/payment/user/:email',async(req,res)=>{
      const email=req.params.email
      const query={email:email}
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })
    // ::::::::::::::: POST METHODS :::::::::::::::::

    app.post('/users', async(req,res)=>{
        const newUser=req.body;
        const filter = {email: newUser.email}
        const isExist = await usersCollection.findOne(filter)
        if(isExist){
            return res.send({
                messege:'user already exist in the bd',
                insertedId: null,
            })
        }
        const result = await usersCollection.insertOne(newUser)
        res.send(result)
    })
    // send contest to pending for approval
    app.post('/pendingContest', async(req,res)=>{
      const contest= req.body;
      const result= await pendingContestCollection.insertOne(contest)
      res.send(result)
    })
    // posting contest data to db
    app.post('/contest', async(req,res)=>{
        const contestInfo= req.body;
        const result= await contestCollection.insertOne(contestInfo)
        res.send(result)
    })

    // ::::::::::::::: PATCH METHODS :::::::::::::::::
    app.patch('/users/updateRole', async(req,res)=>{
      // const id = req.params.id
      const {id,role}=req.body
      console.log(id,role);
      console.log(req.body);
      const filter={_id: new ObjectId(id)}

      const updateDoc={
        $set:{
          role:role
        }
      }
      const result= await usersCollection.updateOne(filter,updateDoc)
      res.send(result)
    })
    app.patch('/contest/:id', async(req,res)=>{
      const id = req.params.id
      const {newparticipation}=req.body
      const query= {_id:id}
      const updateDoc={
        $set:{
          participation:newparticipation
        }
      }
      const result= await contestCollection.updateOne(query,updateDoc)
      res.send(result)
    })

    app.patch('/contest/winner/:id', async(req,res)=>{
      const id= req.params.id
      const setWinner=req.body
      const query={_id:id}
      const updateDoc={
        $set:{
          isWinner: true,
          winnerEmail: setWinner.winnerEmail,
          winnerName: setWinner.winnerName
        }
      }
      const result = await contestCollection.updateOne(query,updateDoc)
      res.send(result)
    })

    app.patch('/pendingContest', async(req,res)=>{
      const {id}=req.body;
      const filter={_id: new ObjectId(id)}
      const updateDoc={
        $set:{
          status:'approved'
        }
      }
      const result= await pendingContestCollection.updateOne(filter,updateDoc)
      res.send(result)
    })
    // update contest info
    app.put('/pendingContest/update/:id', async(req,res)=>{
      const id = req.params.id;
      const query={_id: new ObjectId(id)}
      const updatedContest= req.body;
      const options={upsert:true}
      const updatedoc={
        $set:{
          name: updatedContest.name ,
          type: updatedContest.type ,
          price: updatedContest.price ,
          prize: updatedContest.prize ,
          instructions: updatedContest.instructions,
          deadline:updatedContest.deadline ,
          description:updatedContest.description ,
          participation:0,
          CreatorName: updatedContest.CreatorName, 
          CreatorEmail:updatedContest.CreatorEmail ,
          status: 'pending',
          image:  updatedContest.image
        }
      }
      const result= await pendingContestCollection.updateOne(query,updatedoc,options)
      res.send(result)
    })
    // ::::::::::::::: GET METHODS :::::::::::::::::

    app.get('/contest', async(req,res)=>{
        const result = await contestCollection.find().toArray()
        res.send(result)
    })

    app.get('/contest/:id', async(req,res)=>{
      const id=req.params.id
      const filter={_id: id}
      const result= await contestCollection.findOne(filter)
      res.send(result)
    })
 
    app.get('/users', async(req,res)=>{
        const result = await usersCollection.find().toArray()
        res.send(result)
    })
    app.get('/pendingContest', async(req,res)=>{
      const result = await pendingContestCollection.find().toArray()
      res.send(result)
    })
    app.get('/pendingContest/:id',async(req,res)=>{
      const id= req.params.id
      const filter={_id: new ObjectId(id)}
      const result= await pendingContestCollection.findOne(filter)
      res.send(result)
      
    })
    app.get('/pendingContest/creator/:email', async(req,res)=>{
      // const {email}=req.body
      const email=req.params.email
      const filter={CreatorEmail:email}
      const result = await pendingContestCollection.find(filter).toArray()
      res.send(result)
       
    })
    app.get('/users/admin/:email',verifyToken,verifyAdmin,async(req,res)=>{
      const email=req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({messege:'forbidden access'})
      }
      const query={email:email}
      const user= await usersCollection.findOne(query)
      console.log('check---- ',user);
      let admin =false
      if(user){
        admin = user?.role === 'admin'
      }
      res.send({admin})

    })
    app.get('/users/Creator/:email',async(req,res)=>{
      const email=req.params.email;
      // if(email !== req.decoded.email){
      //   return res.status(403).send({messege:'forbidden access (get)'})
      // }
      const query={email:email}
      const user= await usersCollection.findOne(query)
      console.log('check---- ',user);
      let creator =false
      if(user){
        creator = user?.role === 'creator'
      }
      res.send({creator})

    })
    
    app.get('/admin-stats', async(req,res)=>{
      const users= await usersCollection.estimatedDocumentCount()
      const totalContest= await contestCollection.estimatedDocumentCount()
      const totalPending= await pendingContestCollection.estimatedDocumentCount()
      res.send({users,totalContest,totalPending})
    })
    app.get('/creator-stats/:email', async(req,res)=>{
      const email=req.params.email;
      const query={CreatorEmail:email}
      console.log(email,query);
      const myContest= await pendingContestCollection.countDocuments(query)
      const approvedContest= await contestCollection.countDocuments(query)
      res.send({myContest,approvedContest})
    })
    app.get('/submission/creator/:email',async(req,res)=>{
      const email=req.params.email
      const query={CreatorEmail:email}
      const result= await contestCollection.find(query).toArray()
      res.send(result)
    })
    // ::::::::::::::: DELETE METHODS :::::::::::::::::

    app.delete('/pendingContest/:id', async(req,res)=>{
      const id = req.params.id;
      const filter= {_id: new ObjectId(id)}
      const result= await pendingContestCollection.deleteOne(filter)
      res.send(result)
       
    })
 

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req,res)=>{
    res.send('contest hub is running.........')
})
app.listen(port, ()=>{
    console.log(`server is running on port ${port}`);
})