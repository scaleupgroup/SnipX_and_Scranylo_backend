const { MultiFactorInfo } = require("firebase-admin/auth");
const prisma = require("../utils/prisma");

// get all users in the ext_users table, function used by relevancy web on the /users page
const findSnipxAllUsers = async () => {
    const allUsers = await prisma.snipx_Users.findMany({orderBy: {id: "desc"}});
    console.log("snipx_users:")
    console.log(allUsers)
    return allUsers;
  }

// check if user exists in the database and if the user has "admin" role, function is used by QA extension and relevancy web for authentication
const findSnipxAdminByEmail = async (adminEmail) => {
    const user = await prisma.snipx_Users.findFirst({
      where: {
        email: adminEmail,
        role: "admin"
      }
    });
    return user;
  }

  // find SnipX managers
const findSnipxManagers = async () => {
  const managers = await prisma.snipx_Users.findMany({
    where: {
      role: "manager"
    }
  });
  return managers;
}

  // Update a user by ID
  const updateSnipxUserById = async (id, data) => {
    const updatedUser = await prisma.snipx_Users.update({
      where: { id: parseInt(id) },
      data,
    });
    return updatedUser;
  };
  
  // Delete a user by ID
  const deleteSnipxUserById = async (id) => {
    await prisma.snipx_Users.delete({
      where: { id: parseInt(id) },
    });
  };

  // Create a new user
const addNewSnipxUser = async (data) => {
  const newUser = await prisma.snipx_Users.create({
    data,
  });
  return newUser;
};

  
  module.exports = {
    findSnipxAllUsers,
    findSnipxAdminByEmail,
    updateSnipxUserById,
    deleteSnipxUserById,
    addNewSnipxUser, 
    findSnipxManagers,
  };
  
  