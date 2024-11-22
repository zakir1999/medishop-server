const express = require("express");
const jwt = require("jsonwebtoken");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

//middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.s8jaol5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("mediShop").collection("users");
    const categoryCollection = client.db("mediShop").collection("categories");
    const queriesCollection = client.db("mediShop").collection("queries");
    const askForAddCollection = client.db("mediShop").collection("askForAdd");
    const paymentCollection = client
      .db("mediShop")
      .collection("paymentHistory");
    const mainCategoryCollection = client
      .db("mediShop")
      .collection("maincategory");

    const verifyJWT = (req, res, next) => {
      const token = req.headers.authorization;
      if (!token) {
        return res.status(401).send({ error: true, message: "unauthorized" });
      }
      jwt.verify(token, process.env.PRIVET_KEY, (error, decoded) => {
        if (error) {
          return res.status(401).send({ error: true, message: "unauthorized" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const { email } = req.decoded;
      const isUserExist = await userCollection.findOne({ email });
      if (isUserExist.role !== "admin") {
        return res.status(401).send({ error: true, message: "unauthorized" });
      }
      next();
    };
    // Ad Apis
    app.post("/AddAD", async (req, res) => {
      const data = req.body;
      const result = await askForAddCollection.insertOne(data);
      res.send(result);
    });
    app.get("/getAd", verifyJWT, async (req, res) => {
      const { email } = req.query;
      const result = await askForAddCollection
        .find({ SellerEmail: email })
        .toArray();
      res.send(result);
    });
    app.get("/getAllForAd", verifyJWT, async (req, res) => {
      const result = await askForAddCollection.find().toArray();
      res.send(result);
    });
    app.patch("/updateAd/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const isAdExist = await askForAddCollection.findOne({
        _id: new ObjectId(id),
      });

      let data;
      if (isAdExist.status === "pending") {
        data = { status: "approved" };
      }
      if (isAdExist.status === "approved") {
        data = { status: "pending" };
      }
      const result = await askForAddCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { ...data },
        }
      );
      res.send(result);
    });
    app.get("/adSetBanner", async (req, res) => {
      const result = await askForAddCollection
        .find({ status: "approved" })
        .toArray();
      res.send(result);
    });
    app.get("/getAllAd", async (req, res) => {
      const result = await askForAddCollection.find().toArray();
      res.send(result);
    });

    //user related API
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    app.patch("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const data = req.body;
      const { id } = req.params;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...data } },
        { upsert: true }
      );
      res.send(result);
    });
    app.get("/me", verifyJWT, async (req, res) => {
      const { email } = req.query;
      const result = await userCollection.findOne({ email: email });
      res.send(result);
    });
    app.patch("/updateMe/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { ...data },
        },
        {
          upsert: true,
        }
      );
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      const isUserExist = await userCollection.findOne({ email: user.email });
      if (isUserExist) {
        return res.send({ message: "user aleady exist" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //queries related API
    app.get("/queries", async (req, res) => {
      const result = await queriesCollection.find().toArray();
      res.send(result);
    });

    //categories related API
    app.get("/categories", async (req, res) => {
      const { page = 1, limit = 10, sort = "asc", search = "" } = req.query;
      const searchQuery = search
        ? {
            $or: [
              { medicine_name: { $regex: search, $options: "i" } },
              { genericName: { $regex: search, $options: "i" } },
              { company_name: { $regex: search, $options: "i" } },
            ],
          }
        : {};

      const sortOrder = sort === "asc" ? 1 : -1;

      try {
        const categories = await categoryCollection
          .find(searchQuery)
          .sort({ price_per_unit: sortOrder })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .toArray();

        const total = await categoryCollection.countDocuments(searchQuery);
        const totalPages = Math.ceil(total / limit);

        res.send({
          total,
          totalPages,
          currentPage: page,
          categories,
        });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ error: "An error occurred while fetching categories" });
      }
    });
    app.post("/category", async (req, res) => {
      const data = req.body;
      try {
        const result = await categoryCollection.insertOne(data);
        res.json(result);
      } catch (error) {
        res.json(error);
      }
    });
    app.get("/categories/:category", async (req, res) => {
      const category = req.params.category;
      const query = { category: category };
      const result = await categoryCollection.find(query).toArray();
      // const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/categoriesOfSeller", verifyJWT, async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res
          .status(400)
          .send({ error: "Email query parameter is required" });
      }

      try {
        const userInfo = await userCollection.findOne({ email });

        if (!userInfo) {
          return res.status(404).send({ error: "User not found" });
        }
        const sellerId = userInfo._id.toString();
        const result = await categoryCollection.find({ sellerId }).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error retrieving categories:", error);
        res.status(500).send({ error: "Failed to retrieve categories" });
      }
    });

    // main category related api
    app.get("/maincategory", async (req, res) => {
      const user = req.decoded;
      try {
        const result = await mainCategoryCollection
          .aggregate([
            {
              $lookup: {
                from: "categories",
                localField: "name",
                foreignField: "category",
                as: "medisine",
              },
            },
            {
              $addFields: {
                categoriesCount: { $size: "$medisine" },
              },
            },
            {
              $project: {
                medisine: 0,
              },
            },
          ])
          .toArray();
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    app.post("/maincategory", verifyJWT, verifyAdmin, async (req, res) => {
      const data = req.body;
      const result = await mainCategoryCollection.insertOne(data);
      res.send(result);
    });
    app.patch(
      "/updateMaincategory/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const data = req.body;
        const result = await mainCategoryCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: { ...data },
          }
        );
        res.send(result);
      }
    );
    app.delete(
      "/maincategory/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        console.log(id);
        const result = await mainCategoryCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );
    app.get(
      "/mainCategoryForAdmin",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const result = await mainCategoryCollection.find().toArray();
        res.send(result);
      }
    );

    app.post("/jwt", async (req, res) => {
      const body = req.body;
      const user = await userCollection.findOne({ email: body.email });
      const userData = {
        email: user?.email,
        role: user?.role,
      };
      if (user) {
        const token = jwt.sign(userData, process.env.PRIVET_KEY, {
          expiresIn: 60 * 60,
        });
        res.send({ token });
      }
    });

    // payment
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;
        console.log(price);
        if (!price || typeof price !== "number") {
          return res.status(400).send({ error: "Invalid price value" });
        }
        const amount = price * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        console.log(paymentIntent);
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: "Failed to create payment intent" });
      }
    });

    app.post("/paymentH", async (req, res) => {
      const data = req.body;
      const result = await paymentCollection.insertOne(data);
      res.send(result);
    });
    app.get("/paymentH", async (req, res) => {
      console.log(req.query);
      try {
        const { email } = req.query;
        console.log(email);
        const result = await paymentCollection
          .aggregate([
            { $match: { email } },
            {
              $unwind: "$medicines",
            },
            {
              $lookup: {
                from: "categories",
                let: {
                  medicineId: {
                    $arrayElemAt: [{ $objectToArray: "$medicines" }, 0],
                  },
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$_id", { $toObjectId: "$$medicineId.k" }],
                      },
                    },
                  },
                  {
                    $addFields: {
                      quantity: "$$medicineId.v",
                      tPrice: {
                        $multiply: [
                          "$$medicineId.v",
                          { $toDouble: "$price_per_unit" },
                        ],
                      },
                    },
                  },
                ],
                as: "medicineDetails",
              },
            },
            {
              $unwind: "$medicineDetails",
            },
            {
              $project: {
                "medicineDetails.description": 0,
                "medicineDetails.company_name": 0,
                "medicineDetails.category": 0,
              },
            },
            {
              $group: {
                _id: "$_id",
                email: { $first: "$email" },
                totalPrice: { $first: "$totalPrice" },
                date: { $first: "$date" },
                transectionId: { $first: "$transectionId" },
                paymentStatus: { $first: "$paymentStatus" },
                medicines: { $push: "$medicineDetails" },
              },
            },
            { $sort: { date: -1 } },
            { $limit: 1 },
          ])
          .next();

        res.send(result);
      } catch (error) {
        console.error("Error retrieving payments", error);
        res.status(500).send({ error: "Failed to retrieve payments" });
      }
    });
    // ---------------------------------------------------->me payment history
    app.get("/mePaymentH", verifyJWT, async (req, res) => {
      try {
        const { email } = req.query;
        console.log(email);
        const result = await paymentCollection
          .aggregate([
            { $match: { email } },
            {
              $unwind: "$medicines",
            },
            {
              $lookup: {
                from: "categories",
                let: {
                  medicineId: {
                    $arrayElemAt: [{ $objectToArray: "$medicines" }, 0],
                  },
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$_id", { $toObjectId: "$$medicineId.k" }],
                      },
                    },
                  },
                  {
                    $addFields: {
                      quantity: "$$medicineId.v",
                      tPrice: {
                        $multiply: [
                          "$$medicineId.v",
                          { $toDouble: "$price_per_unit" },
                        ],
                      },
                    },
                  },
                ],
                as: "medicineDetails",
              },
            },
            {
              $unwind: "$medicineDetails",
            },
            {
              $project: {
                "medicineDetails.description": 0,
                "medicineDetails.company_name": 0,
                "medicineDetails.category": 0,
              },
            },
            {
              $group: {
                _id: "$_id",
                email: { $first: "$email" },
                totalPrice: { $first: "$totalPrice" },
                date: { $first: "$date" },
                transectionId: { $first: "$transectionId" },
                paymentStatus: { $first: "$paymentStatus" },
                medicines: { $push: "$medicineDetails" },
              },
            },
            { $sort: { date: -1 } },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error retrieving payments", error);
        res.status(500).send({ error: "Failed to retrieve payments" });
      }
    });
    //  new
    app.get("/allpayment", async (req, res) => {
      const result = await paymentCollection
        .find({}, { sort: { data: -1 } })
        .toArray();
      res.send(result);
    });
    app.get("/sellesHistory", async (req, res) => {
      try {
        const { email } = req.query;

        // Ensure the email parameter is provided
        if (!email) {
          return res
            .status(400)
            .send({ message: "Email parameter is required" });
        }

        // Find the user by email
        const userData = await userCollection.findOne({ email });

        if (!userData) {
          return res.status(404).send({ message: "User not found" });
        }
        console.log(userData);

        // Perform aggregation to match payments and get medicines details
        const result = await categoryCollection
          .aggregate([
            {
              $match: { sellerId: userData._id.toString() },
            },
            {
              $lookup: {
                from: "payment", // Replace with your payment collection name
                let: { categoryId: "$_id" },
                pipeline: [
                  {
                    $unwind: "$medicines",
                  },
                  {
                    $match: {
                      $expr: {
                        $eq: [
                          "$$categoryId",
                          { $toString: "$medicines.categoryId" },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalSold: { $sum: "$medicines.quantity" },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      totalSold: 1,
                    },
                  },
                ],
                as: "sales",
              },
            },
            {
              $unwind: { path: "$sales", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                _id: 1, // or any other fields you want to include
                totalSold: { $ifNull: ["$sales.totalSold", 0] },
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching sales history:", error);
        res
          .status(500)
          .send({ message: "An error occurred while fetching sales history" });
      }
    });
    // new

    app.get("/sellsReport", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const { startDate, endDate } = req.query;

        const matchConditions = {};

        if (startDate) {
          matchConditions.date = matchConditions.date || {};
          matchConditions.date.$gte = new Date(startDate);
        }

        if (endDate) {
          matchConditions.date = matchConditions.date || {};
          matchConditions.date.$lte = new Date(endDate);
        }
        console.log(matchConditions);

        const result = await paymentCollection
          .aggregate([
            { $match: { ...matchConditions, paymentStatus: "paid" } },
            // { $sort: { date: -1 } },
            { $unwind: "$medicines" },
            {
              $lookup: {
                from: "categories",
                let: {
                  medicineId: {
                    $arrayElemAt: [{ $objectToArray: "$medicines" }, 0],
                  },
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$_id", { $toObjectId: "$$medicineId.k" }],
                      },
                    },
                  },
                  {
                    $addFields: {
                      quantity: "$$medicineId.v",
                      tPrice: {
                        $multiply: [
                          "$$medicineId.v",
                          { $toDouble: "$price_per_unit" },
                        ],
                      },
                    },
                  },
                ],
                as: "medicineDetails",
              },
            },
            { $unwind: "$medicineDetails" },
            {
              $addFields: {
                sellerId: { $toObjectId: "$medicineDetails.sellerId" },
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "sellerId",
                foreignField: "_id",
                as: "sellerDetails",
              },
            },
            // { $unwind: "$sellerDetails" },
            {
              $project: {
                "medicineDetails.description": 0,
                "medicineDetails.company_name": 0,
                "medicineDetails.category": 0,
                "medicineDetails.image": 0,
                "medicineDetails.discount": 0,
                "sellerDetails.password": 0,
                "sellerDetails.otherSensitiveField": 0,
              },
            },
            {
              $group: {
                _id: "$_id",
                email: { $first: "$email" },
                totalPrice: { $first: "$totalPrice" },
                date: { $first: "$date" },
                transectionId: { $first: "$transectionId" },
                paymentStatus: { $first: "$paymentStatus" },
                medicines: {
                  $push: {
                    $mergeObjects: [
                      "$medicineDetails",
                      { sellerEmail: "$sellerDetails.email" },
                    ],
                  },
                },
              },
            },
            { $sort: { date: -1 } },
          ])
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error retrieving payments", error);
        res.status(500).send({ error: "Failed to retrieve payments" });
      }
    });

    // new

    app.patch(
      "/changeStatusPayment/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const data = {
          paymentStatus: "paid",
        };
        const result = await paymentCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: { ...data },
          }
        );
        res.send(result);
      }
    );
    app.get("/categories/:category", async (req, res) => {
      const category = req.params.category;
      const query = { category: category };
      const cursor = await categoryCollection.find(query).toArray();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get('/discounts', async (req, res) => {
      try {
          const query = { discount: { $gt: 0 } };
          const result = await categoryCollection.find(query).toArray();
          res.send(result);
      } catch (error) {
          console.error(error);
          res.status(500).send('An error occurred while fetching discounted products');
      }
  });
    // app.get("/sellerPaymentHistory", async (req, res) => {
    //   try {
    //     const { email } = req.query;
    //     const user = await userCollection.findOne({ email });
    //     if (!user) {
    //       return res.status(404).send({ error: "User not found" });
    //     }
    //     const userId = user._id;

    //     const result = await categoryCollection
    //       .aggregate([
    //         {
    //           $match: { sellerId: userId.toString() },
    //         },
    //         {
    //           $lookup: {
    //             from: "paymentHistory",
    //             pipeline: [
    //               {
    //                 $unwind: "$medicines",
    //               },
    //               {
    //                 $addFields: {
    //                   medicineId: {
    //                     $arrayElemAt: [{ $objectToArray: "$medicines" }, 0],
    //                   },
    //                 },
    //               },
    //               {
    //                 $lookup: {
    //                   from: "categories",
    //                   localField: "medicineId.k",
    //                   foreignField: "_id",
    //                   as: "medicineDetails",
    //                 },
    //               },
    //               {
    //                 $unwind: "$medicineDetails",
    //               },
    //               {
    //                 $match: {
    //                   "medicineDetails.sellerId": userId.toString(),
    //                 },
    //               },
    //               {
    //                 $group: {
    //                   _id: "$_id",
    //                   email: { $first: "$email" },
    //                   totalPrice: { $first: "$totalPrice" },
    //                   date: { $first: "$date" },
    //                   transectionId: { $first: "$transectionId" },
    //                   paymentStatus: { $first: "$paymentStatus" },
    //                   medicines: {
    //                     $push: "$medicines",
    //                   },
    //                 },
    //               },
    //             ],
    //             as: "paymentData",
    //           },
    //         },
    //       ])
    //       .toArray();

    //     res.send(result);
    //   } catch (error) {
    //     console.error("Error retrieving seller payment history", error);
    //     res
    //       .status(500)
    //       .send({ error: "Failed to retrieve seller payment history" });
    //   }
    // });
    
    app.get("/sellerRevenue", async (req, res) => {
      try {
        const { email } = req.query;
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        const totalPaid = 0;
        // Aggregate to find payments related to the seller
        const result = await categoryCollection
          .aggregate([
            {
              $match: { sellerId: user._id.toString() },
            },
            {
              $lookup: {
                from: "paymentHistory",
                let: { categoryId: "$_id" },
                pipeline: [
                  { $unwind: "$medicines" },
                  {
                    $match: {
                      $expr: {
                        $eq: [
                          "$$categoryId",
                          {
                            $toObjectId: {
                              $first: {
                                $map: {
                                  input: { $objectToArray: "$medicines" },
                                  as: "med",
                                  in: "$$med.k",
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
                as: "paymentData",
              },
            },
            {
              $unwind: "$paymentData",
            },
            {
              $project: {
                paymentData: 1,
              },
            },
          ])
          .toArray();
        const totalPending = result?.reduce(
          (pre, curr) => pre + parseFloat(curr?.paymentData?.totalPrice),
          0
        );
        console.log(totalPending);
        res.send({
          pending: result.length,
          paid: 0,
          totalPending,
          totalPaid,
          totalPrice: totalPending + totalPaid,
        });
        // res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Error fetching seller revenue data", error });
      }
    });
    
    app.get("/revenueAdmin", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      const totalPrice = result.reduce((accumulator, currentValue) => {
        return accumulator + parseFloat(currentValue.totalPrice);
      }, 0);
      // const totalP
      const paid = (
        await paymentCollection.find({ paymentStatus: "paid" }).toArray()
      ).length;
      const pending = (
        await paymentCollection.find({ paymentStatus: "pending" }).toArray()
      ).length;
      const totalUser = (await userCollection.find().toArray()).length - 1;
      res.send({
        totalPrice,
        paid,
        pending,
        totalUser,
      });
    });
    app.get("/sellerPaymentHistory", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res.status(400).send({ error: "Email is required" });
        }

        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

        const userId = user._id.toString();

        const result = await categoryCollection
          .aggregate([
            {
              $match: { sellerId: userId },
            },
            {
              $lookup: {
                from: "paymentHistory",
                let: { categoryId: "$_id" },
                pipeline: [
                  { $unwind: "$medicines" },
                  {
                    $match: {
                      $expr: {
                        $eq: [
                          "$$categoryId",
                          {
                            $toObjectId: {
                              $first: {
                                $map: {
                                  input: { $objectToArray: "$medicines" },
                                  as: "med",
                                  in: "$$med.k",
                                },
                              },
                            },
                          },
                        ],
                      },
                      paymentStatus: { $in: ["pending", "paid"] },
                    },
                  },
                ],
                as: "paymentData",
              },
            },
            {
              $project: {
                _id: 1,
                medicine_name: 1,
                category: 1,
                company_name: 1,
                price_per_unit: 1,
                description: 1,
                discount: 1,
                paymentData: {
                  paymentStatus: 1,
                  email: 1,
                  _id: 1, // Optionally include other fields you need
                },
              },
            },
            {
              $match: {
                "paymentData.paymentStatus": { $in: ["pending", "paid"] },
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching seller payment history:", error);
        res.status(500).send({
          error: "An error occurred while fetching the seller payment history",
        });
      }
    });

    app.get("/cat", async (req, res) => {
      try {
        const result = await categoryCollection
          .aggregate([
            {
              $addFields: {
                sellerId: { $toObjectId: "$sellerId" },
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "sellerId",
                foreignField: "_id",
                as: "seller",
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error retrieving categories", error);
        res.status(500).send({ error: "Failed to retrieve categories" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("medi World!");
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});




