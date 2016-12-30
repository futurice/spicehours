const eth = require('../server/eth');

const SpiceMembers = eth.contracts.SpiceMembers;

eth.prepare().then(() => {
  console.log('Adding members');
}).then(() => {
  const members = SpiceMembers.deployed();
  return members.addMember('0x6799a1d5f574ef1c376f5515ee7e2b8b06b30754', { gas: 1000000 });
}).then(() => {
  const members = SpiceMembers.deployed();
  return members.setMemberLevel('0x6799a1d5f574ef1c376f5515ee7e2b8b06b30754', 3, { gas: 1000000 });
}).then(() => {
  const members = SpiceMembers.deployed();
  return members.addMember('0x6b8ba21c8875342f49a9d7b5eb31a0b1df099cd3', { gas: 1000000 });
}).then(() => {
  const members = SpiceMembers.deployed();
  return members.setMemberLevel('0x6b8ba21c8875342f49a9d7b5eb31a0b1df099cd3', 2);
}).then(() => {
  const members = SpiceMembers.deployed();
  return members.addMember('0xf086f7d8e8adD5CD3D8788f85f5724655d52923b', { gas: 1000000 });
}).then(() => {
  const members = SpiceMembers.deployed();
  return members.setMemberLevel('0xf086f7d8e8adD5CD3D8788f85f5724655d52923b', 3, { gas: 1000000 });
}).then(() => {
  console.log('Added members successfully');
}).catch(err => console.log(err));
