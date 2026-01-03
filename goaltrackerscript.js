document.addEventListener("DOMContentLoaded", function(){
const goals =[{
  name: "Education",
  priority: "High Priority",
  yearsleft: 12,
  elapsed: 3,
  target: 10000000,
  current: 2000000,
  initial: 500000
},
{
  name: "Car",
  priority: "Low Priority",
  yearsleft: 5,
  elapsed: 3,
  target: 100000,
  current: 35000,
  initial: 15000
},
{
  name: "Retirement",
  priority: "Medium Priority",
  yearsleft: 20,
  elapsed: 8,
  target: 20000000,
  current: 2000000,
  initial: 500000
},
];
var goalblock = document.getElementById("goals");
var templates = document.getElementById("goaltemplate");
var charting = document.getElementById("displaychart").getContext("2d");
var chart = null;

function updategoallist(goals){
  var totaltargets  = 0;
  var totalcurrents = 0;

  for(var i=0; i <goals.length; i++){
    totaltargets += goals[i].target;
    totalcurrents += goals[i].current;
  }


document.getElementById("totalgoals").innerText=goals.length;
document.getElementById("totaltarget").innerText=totaltargets;
var overall = (totalcurrents/totaltargets) * 100;
document.getElementById("overallprogression").innerText =overall.toFixed(1) + "%";
}

function updateingmaingoal(goal){
document.getElementById("goalname").innerText = goal.name;
document.getElementById("priority").innerText = goal.priority;
document.getElementById("timeleft").innerText = goal.yearsleft + " years left";
document.getElementById("ta").innerText = goal.target;
document.getElementById("ca").innerText = goal.current;
document.getElementById("ii").innerText = goal.initial;
document.getElementById("sf").innerText = (goal.target-goal.current);

var progress = (goal.current / goal.target) * 100;
document.getElementById("progresspercentage").innerText = progress.toFixed(1) + ("%");
document.getElementById("progressfillup").style.width =progress + ("%");
document.getElementById("timeelapsed").innerText = goal.elapsed + " years elapsed";
document.getElementById("timeremaining").innerText = goal.yearsleft +" years remaining";

document.getElementById("totalsipamount").innerText = "15000 / month";
document.getElementById("sipmeta").innerText = "Estimated value";

updatingcharts(goal);
}

function updatingcharts(goal){
  if(chart){
    chart.destroy();
  }

chart = new Chart(charting, {
  type: "line",
  data: {
    labels: ["Now", "Mid", "Goal"],
    datasets: [{
      label: goal.name + " Growth",
      data: [goal.current, Math.round(goal.target * 0.6), goal.target],
      borderWidth: 2,
      fill: false
    }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false
  }
});
}

const goalbutton = document.getElementById("addgoalbutton");
const goalbtn = document.getElementById("addgoals");
const closebtn = document.getElementById("closebutton");
const cancelbutton = document.getElementById("cancelbtn");
const formbtn = document.getElementById("goaladditionform");

goalbutton.addEventListener("click", () => {
  goalbtn.style.display = "flex";
});

closebtn.addEventListener("click", () => {
  goalbtn.style.display = "none";
});

cancelbutton.addEventListener("click", () => {
  goalbtn.style.display = "none";
});

goalbutton.addEventListener("click", (e) => {
  if(e.target == goalbtn){
  goalbtn.style.display = "none";
  }
});

formbtn.addEventListener("submit", (e)=>{
  e.preventDefault();
  console.log("Your Goal Is Created");
  formbtn.style.display="none";
});

goalblock.innerHTML = "";
for(var i = 0;i < goals.length; i++){
  var goal = goals[i];
  var duplicates = templates.content.cloneNode(true);

  var progress = Math.round((goal.current/goal.target)*100);

  duplicates.querySelector(".goalname").innerText = goal.name;
  duplicates.querySelector(".proegression").innerText = progress + "%";
  duplicates.querySelector(".goalpriority").innerText = goal.priority;
  duplicates.querySelector(".goalcards").onclick = function(g){
    return function(){
       updateingmaingoal(g);
    };
  }(goal);
 
  
  goalblock.appendChild(duplicates);
}


updateingmaingoal(goals[0]);
updategoallist(goals);

});


