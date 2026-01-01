const goal = {
  name: "Education",
  priority: "High Priority",
  yearsleft: 12,
  elapsed: 3,
  target: 10000000,
  current: 2000000,
  initial: 500000
};
document.getElementById("totalgoals").innerText="1";
document.getElementById("totaltarget").innerText=goal.target;
document.getElementById("overallprogression").innerText =((goal.current / goal.target) * 100).toFixed(1) + "%";

document.getElementById("goalname").innerText = goal.name;
document.getElementById("priority").innerText = goal.priority;
document.getElementById("timeleft").innerText = goal.yearsLeft + " years left";
document.getElementById("ta").innerText = goal.target;
document.getElementById("ca").innerText = goal.current;
document.getElementById("ii").innerText = goal.initial;
document.getElementById("sf").innerText = (goal.target-goal.current);

const progress = (goal.current / goal.target) * 100;
document.getElementById("progresspercentage").innerText = progress.toFixed(1) + ("%");
document.getElementById("progressfillup").style.width =progress + ("%");
document.getElementById("timeelapsed").innerText = goal.elapsed + " years elapsed";
document.getElementById("timeremaining").innerText = goal.yearsleft +" years remaining";

document.getElementById("totalsipamount").innerText = "15000 / month";
document.getElementById("sipmeta").innerText = "Estimated value";



const charting = document.getElementById("displaychart").getContext("2d");
new Chart(charting, {
  type: "line",
  data: {
    labels: ["Now", "Year 4", "Year 8", "Year 12"],
    datasets: [{
      label: "Investment Growth",
      data: [2000000, 4000000, 7000000, 10000000],
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



